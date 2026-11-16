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
  deleteObject(key: string): Promise<void>;
};

const REQUEST_TIMEOUT_MS = 15_000;
const encoder = new TextEncoder();

function safeProviderError(): ApiError {
  return new ApiError(503, "STORAGE_PROVIDER_UNAVAILABLE", "The storage provider could not complete the requested operation.");
}
function bytesOf(body: ArrayBuffer | Uint8Array): Uint8Array {
  return body instanceof Uint8Array ? body : new Uint8Array(body);
}
function hex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: Uint8Array | string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : value)));
}
async function hmac(key: Uint8Array | string, value: string): Promise<Uint8Array> {
  const raw = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
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
): Promise<Response> {
  const metadata = config.metadata;
  const credentials = config.credentials;
  if (config.configurationStatus !== "configured" || !credentials?.keyId || !credentials.applicationKey || !credentials.endpoint) throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The storage destination is not configured.");
  const endpoint = safeEndpoint(credentials.endpoint);
  const path = "/" + awsEncodePath(metadata.bucketName) + "/" + awsEncodePath(assertStorageObjectKey(key));
  const url = new URL(endpoint.origin + path);
  const payloadHash = await sha256(body ?? new Uint8Array());
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = date + "/" + metadata.region + "/s3/aws4_request";
  const canonicalHeaders = "host:" + url.host + "\n" + "x-amz-content-sha256:" + payloadHash + "\n" + "x-amz-date:" + amzDate + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
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
      ...(method === "PUT" ? { body: body ?? new Uint8Array() } : {}),
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
      await this.putObject(key, encoder.encode("bq-sqwad-storage-health-check"), "text/plain");
      const info = await this.headObject(key);
      if (!info || info.sizeBytes !== 29) throw safeProviderError();
      const downloaded = await this.getObject(key);
      if (new TextDecoder().decode(downloaded.body) !== "bq-sqwad-storage-health-check") throw safeProviderError();
      await this.deleteObject(key);
      return { healthy: true };
    },
    async putObject(key, body, contentType) {
      const response = await b2Request(config, "PUT", key, bytesOf(body), contentType);
      if (!response.ok) throw safeProviderError();
    },
    async getObject(key) {
      const response = await b2Request(config, "GET", key);
      if (!response.ok) throw safeProviderError();
      const body = await response.arrayBuffer();
      return { body, info: { sizeBytes: body.byteLength, etag: response.headers.get("etag"), contentType: response.headers.get("content-type") } };
    },
    async headObject(key) {
      const response = await b2Request(config, "HEAD", key);
      if (response.status === 404) return null;
      if (!response.ok) throw safeProviderError();
      return { sizeBytes: Number(response.headers.get("content-length") ?? 0), etag: response.headers.get("etag"), contentType: response.headers.get("content-type") };
    },
    async deleteObject(key) {
      const response = await b2Request(config, "DELETE", key);
      if (!response.ok && response.status !== 404) throw safeProviderError();
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
      await this.putObject(key, encoder.encode("bq-sqwad-storage-health-check"), "text/plain");
      const info = await this.headObject(key);
      if (!info || info.sizeBytes !== 29) throw safeProviderError();
      const result = await this.getObject(key);
      if (new TextDecoder().decode(result.body) !== "bq-sqwad-storage-health-check") throw safeProviderError();
      await this.deleteObject(key);
      return { healthy: true };
    },
    async putObject(key, body, contentType) {
      const { error } = await bucket.upload(assertStorageObjectKey(key), bytesOf(body), { contentType, upsert: false });
      if (error) throw safeProviderError();
    },
    async getObject(key) {
      const { data, error } = await bucket.download(assertStorageObjectKey(key));
      if (error || !data) throw safeProviderError();
      const body = await data.arrayBuffer();
      return { body, info: { sizeBytes: body.byteLength, etag: null, contentType: data.type || null } };
    },
    async headObject(key) {
      const safeKey = assertStorageObjectKey(key);
      const parts = safeKey.split("/");
      const filename = parts.pop();
      const folder = parts.join("/");
      const { data, error } = await bucket.list(folder, { search: filename, limit: 100 });
      if (error) throw safeProviderError();
      const item = data.find(entry => entry.name === filename);
      if (!item) return null;
      const size = item.metadata && typeof item.metadata === "object" && "size" in item.metadata ? Number(item.metadata.size) : 0;
      return { sizeBytes: Number.isSafeInteger(size) && size >= 0 ? size : 0, etag: item.id ?? null, contentType: typeof item.metadata?.["mimetype"] === "string" ? item.metadata["mimetype"] : null };
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
