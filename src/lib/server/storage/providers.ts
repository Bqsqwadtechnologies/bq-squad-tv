import { createClient } from "@supabase/supabase-js";
import { ApiError } from "../firebase-admin";
import { assertStorageObjectKey } from "./ledger";
import type { StorageDestinationConfiguration } from "./registry";

export type StorageObjectInfo = { sizeBytes: number; etag: string | null; contentType: string | null };
export type StorageProviderAdapter = {
  healthCheck(): Promise<{ healthy: true }>;
  putObject(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void>;
  getObject(key: string): Promise<{ body: ArrayBuffer; info: StorageObjectInfo }>;
  headObject(key: string): Promise<StorageObjectInfo | null>;
  listObjects(prefix: string, cursor: string | null): Promise<{ objects: Array<{ key: string; sizeBytes: number }>; nextCursor: string | null }>;
  deleteObject(key: string): Promise<void>;
};

const REQUEST_TIMEOUT_MS = 15_000;
const encoder = new TextEncoder();

function safeProviderError(status?: number): ApiError {
  if (status === 402) return new ApiError(429, "STORAGE_PROVIDER_PAYMENT_REQUIRED", "The storage provider requires an account allowance review.");
  if (status === 429) return new ApiError(429, "STORAGE_PROVIDER_RATE_LIMITED", "The storage provider temporarily limited requests.");
  if (status === 413 || status === 507) return new ApiError(429, "STORAGE_PROVIDER_QUOTA", "The storage provider reports that its storage allowance is exhausted.");
  if (status === 403) return new ApiError(503, "STORAGE_PROVIDER_PERMISSION_DENIED", "The storage provider denied access to this location.");
  return new ApiError(503, "STORAGE_PROVIDER_UNAVAILABLE", "The storage provider could not complete the requested operation.");
}

function providerErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as Record<string, unknown>;
  const status = Number(value["statusCode"] ?? value["status"]);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined;
}
function bytesOf(body: ArrayBuffer | Uint8Array): Uint8Array {
  return body instanceof Uint8Array ? body : new Uint8Array(body);
}
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
function hex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: Uint8Array | string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", toArrayBuffer(typeof value === "string" ? encoder.encode(value) : value))));
}
async function hmac(key: Uint8Array | string, value: string): Promise<Uint8Array> {
  const raw = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", toArrayBuffer(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, toArrayBuffer(encoder.encode(value))));
}
function awsEncodePath(value: string): string {
  return value.split("/").map(part => encodeURIComponent(part).replace(/[!'()*]/g, char => "%" + char.charCodeAt(0).toString(16).toUpperCase())).join("/");
}
function safeEndpoint(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !url.hostname.endsWith(".backblazeb2.com")) throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The storage destination configuration is invalid.");
  return url;
}
function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

async function b2Request(
  config: StorageDestinationConfiguration,
  method: "PUT" | "GET" | "HEAD" | "DELETE",
  key: string,
  body?: Uint8Array,
  contentType = "application/octet-stream",
  query: Record<string, string> = {},
): Promise<Response> {
  const metadata = config.metadata;
  const credentials = config.credentials;
  if (config.configurationStatus !== "configured" || !credentials?.keyId || !credentials.applicationKey || !credentials.endpoint) throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The storage destination is not configured.");
  const endpoint = safeEndpoint(credentials.endpoint);
  const path = "/" + awsEncodePath(metadata.bucketName) + "/" + (key ? awsEncodePath(assertStorageObjectKey(key)) : "");
  const url = new URL(endpoint.origin + path);
  const canonicalQuery = Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => encodeURIComponent(name).replace(/[!'()*]/g, char => "%" + char.charCodeAt(0).toString(16).toUpperCase()) + "=" +
      encodeURIComponent(value).replace(/[!'()*]/g, char => "%" + char.charCodeAt(0).toString(16).toUpperCase()))
    .join("&");
  url.search = canonicalQuery;
  const payloadHash = await sha256(body ?? new Uint8Array());
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = date + "/" + metadata.region + "/s3/aws4_request";
  const canonicalHeaders = "host:" + url.host + "\n" + "x-amz-content-sha256:" + payloadHash + "\n" + "x-amz-date:" + amzDate + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(canonicalRequest)].join("\n");
  const dateKey = await hmac("AWS4" + credentials.applicationKey, date);
  const regionKey = await hmac(dateKey, metadata.region);
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));
  const authorization = "AWS4-HMAC-SHA256 Credential=" + credentials.keyId + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;
  try {
    return await fetch(url, {
      method,
      headers: {
        authorization: authorization,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        ...(method === "PUT" ? { "content-type": contentType } : {}),
      },
      ...(method === "PUT" ? { body: toArrayBuffer(body ?? new Uint8Array()) } : {}),
      signal: timeoutSignal(),
    });
  } catch {
    throw safeProviderError();
  }
}

function createB2Adapter(config: StorageDestinationConfiguration): StorageProviderAdapter {
  return {
    async healthCheck() {
      const key = "health-check/" + crypto.randomUUID() + ".txt";
      try {
        await this.putObject(key, encoder.encode("bq-sqwad-storage-health-check"), "text/plain");
        const info = await this.headObject(key);
        if (!info || info.sizeBytes !== 29) throw safeProviderError();
        const downloaded = await this.getObject(key);
        if (new TextDecoder().decode(downloaded.body) !== "bq-sqwad-storage-health-check") throw safeProviderError();
        return { healthy: true };
      } finally {
        await this.deleteObject(key);
      }
    },
    async putObject(key, body, contentType) {
      const response = await b2Request(config, "PUT", key, bytesOf(body), contentType);
      if (!response.ok) throw safeProviderError(response.status);
    },
    async getObject(key) {
      const response = await b2Request(config, "GET", key);
      if (!response.ok) throw safeProviderError(response.status);
      const body = await response.arrayBuffer();
      return { body, info: { sizeBytes: body.byteLength, etag: response.headers.get("etag"), contentType: response.headers.get("content-type") } };
    },
    async headObject(key) {
      const response = await b2Request(config, "HEAD", key);
      if (response.status === 404) return null;
      if (!response.ok) throw safeProviderError(response.status);
      return { sizeBytes: Number(response.headers.get("content-length") ?? 0), etag: response.headers.get("etag"), contentType: response.headers.get("content-type") };
    },
    async listObjects(prefix, cursor) {
      const query: Record<string, string> = { "list-type": "2" };
      if (prefix) query["prefix"] = assertStorageObjectKey(prefix).replace(/\/$/, "") + "/";
      if (cursor) query["continuation-token"] = cursor;
      const response = await b2Request(config, "GET", "", undefined, "application/octet-stream", query);
      if (!response.ok) throw safeProviderError(response.status);
      const xml = await response.text();
      const decodeXml = (value: string) => value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      const objects: Array<{ key: string; sizeBytes: number }> = [];
      for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const block = match[1] ?? "";
        const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
        const size = Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] ?? "NaN");
        if (!key || !Number.isSafeInteger(size) || size < 0) throw safeProviderError();
        objects.push({ key: decodeXml(key), sizeBytes: size });
      }
      const truncated = /<IsTruncated>true<\/IsTruncated>/i.test(xml);
      const next = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
      return { objects, nextCursor: truncated && next ? decodeXml(next) : null };
    },
    async deleteObject(key) {
      const response = await b2Request(config, "DELETE", key);
      if (!response.ok && response.status !== 404) throw safeProviderError(response.status);
    },
  };
}

function createLovableAdapter(config: StorageDestinationConfiguration): StorageProviderAdapter {
  const credentials = config.credentials;
  if (config.configurationStatus !== "configured" || !credentials?.url || !credentials.serviceRoleKey) throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The storage destination is not configured.");
  const client = createClient(credentials.url, credentials.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? timeoutSignal() }) },
  });
  const bucket = client.storage.from(config.metadata.bucketName);
  return {
    async healthCheck() {
      const key = "health-check/" + crypto.randomUUID() + ".txt";
      try {
        await this.putObject(key, encoder.encode("bq-sqwad-storage-health-check"), "text/plain");
        const info = await this.headObject(key);
        if (!info || info.sizeBytes !== 29) throw safeProviderError();
        const result = await this.getObject(key);
        if (new TextDecoder().decode(result.body) !== "bq-sqwad-storage-health-check") throw safeProviderError();
        return { healthy: true };
      } finally {
        await this.deleteObject(key);
      }
    },
    async putObject(key, body, contentType) {
      const { error } = await bucket.upload(assertStorageObjectKey(key), bytesOf(body), { contentType, upsert: false });
      if (error) throw safeProviderError(providerErrorStatus(error));
    },
    async getObject(key) {
      const { data, error } = await bucket.download(assertStorageObjectKey(key));
      if (error || !data) throw safeProviderError(providerErrorStatus(error));
      const body = await data.arrayBuffer();
      return { body, info: { sizeBytes: body.byteLength, etag: null, contentType: data.type || null } };
    },
    async headObject(key) {
      const safeKey = assertStorageObjectKey(key);
      const parts = safeKey.split("/");
      const filename = parts.pop();
      if (!filename) throw new ApiError(400, "STORAGE_OBJECT_KEY_INVALID", "The storage object key is invalid.");
      const folder = parts.join("/");
      const { data, error } = await bucket.list(folder, { search: filename, limit: 100 });
      if (error) throw safeProviderError(providerErrorStatus(error));
      const item = data.find(entry => entry.name === filename);
      if (!item) return null;
      const size = item.metadata && typeof item.metadata === "object" && "size" in item.metadata ? Number(item.metadata.size) : 0;
      return { sizeBytes: Number.isSafeInteger(size) && size >= 0 ? size : 0, etag: item.id ?? null, contentType: typeof item.metadata?.["mimetype"] === "string" ? item.metadata["mimetype"] : null };
    },
    async listObjects(prefix, cursor) {
      const safePrefix = prefix ? assertStorageObjectKey(prefix).replace(/\/$/, "") : "";
      const state = cursor ? (() => {
        try {
          const decoded = JSON.parse(atob(cursor)) as { folders?: Array<{ path: string; offset: number }> };
          if (!Array.isArray(decoded.folders)) throw new Error("invalid");
          return decoded.folders.filter(item => typeof item.path === "string" && Number.isSafeInteger(item.offset) && item.offset >= 0);
        } catch { throw new ApiError(400, "STORAGE_CURSOR_INVALID", "The storage listing cursor is invalid."); }
      })() : [{ path: safePrefix, offset: 0 }];
      const objects: Array<{ key: string; sizeBytes: number }> = [];
      while (state.length && objects.length < 1000) {
        const current = state.shift();
        if (!current) break;
        const { data, error } = await bucket.list(current.path, { limit: 1000, offset: current.offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw safeProviderError(providerErrorStatus(error));
        for (const item of data) {
          const key = current.path ? current.path + "/" + item.name : item.name;
          if (item.id === null) state.push({ path: key, offset: 0 });
          else {
            const size = item.metadata && typeof item.metadata === "object" && "size" in item.metadata ? Number(item.metadata.size) : NaN;
            if (!Number.isSafeInteger(size) || size < 0) throw safeProviderError();
            objects.push({ key, sizeBytes: size });
          }
        }
        if (data.length === 1000) state.unshift({ path: current.path, offset: current.offset + 1000 });
      }
      const nextCursor = state.length ? btoa(JSON.stringify({ folders: state })) : null;
      return { objects, nextCursor };
    },
    async deleteObject(key) {
      const { error } = await bucket.remove([assertStorageObjectKey(key)]);
      if (error) throw safeProviderError();
    },
  };
}

export function createStorageProviderAdapter(config: StorageDestinationConfiguration): StorageProviderAdapter {
  if (config.metadata.providerType === "backblaze_b2") return createB2Adapter(config);
  if (config.metadata.providerType === "lovable_storage") return createLovableAdapter(config);
  throw new ApiError(400, "STORAGE_PROVIDER_UNSUPPORTED", "The storage provider is not supported.");
}
