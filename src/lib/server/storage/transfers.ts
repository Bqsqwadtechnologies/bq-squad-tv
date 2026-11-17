import { createClient } from "@supabase/supabase-js";
import { ApiError } from "../firebase-admin";
import { LEGACY_SOURCE_DESTINATION_ID, LEGACY_STREAM_DESTINATION_ID, resolveAssetStreamBinding } from "./asset-binding";
import { assertStorageObjectKey, resolveAssetStorageBinding } from "./ledger";
import type { StorageDestinationConfiguration } from "./registry";
import { chooseReplicaForSession } from "./replica-assignment";

const encoder = new TextEncoder();
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
function hex(bytes: Uint8Array): string { return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join(""); }
async function digest(value: string): Promise<string> { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", toArrayBuffer(encoder.encode(value))))); }
async function sign(key: Uint8Array | string, value: string): Promise<Uint8Array> {
  const raw = typeof key === "string" ? encoder.encode(key) : key;
  const imported = await crypto.subtle.importKey("raw", toArrayBuffer(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, toArrayBuffer(encoder.encode(value))));
}
function encodePath(value: string): string {
  return value.split("/").map(part => encodeURIComponent(part).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/");
}
function credentials(config: StorageDestinationConfiguration) {
  if (config.configurationStatus !== "configured" || !config.credentials) throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The storage destination is not configured.");
  return config.credentials;
}
async function b2Url(config: StorageDestinationConfiguration, key: string, method: "PUT" | "GET", expiresSeconds: number): Promise<string> {
  const c = credentials(config);
  if (!c.keyId || !c.applicationKey || !c.endpoint) throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The storage destination is not configured.");
  const endpoint = new URL(c.endpoint);
  if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".backblazeb2.com") || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The storage destination endpoint is invalid.");
  }
  const url = new URL(endpoint.origin + "/" + encodePath(config.metadata.bucketName) + "/" + encodePath(assertStorageObjectKey(key)));
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = date + "/" + config.metadata.region + "/s3/aws4_request";
  const params: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", c.keyId + "/" + scope],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = params.map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).sort().join("&");
  const canonicalRequest = [method, url.pathname, canonicalQuery, "host:" + url.host + "\n", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await digest(canonicalRequest)].join("\n");
  const dateKey = await sign("AWS4" + c.applicationKey, date);
  const regionKey = await sign(dateKey, config.metadata.region);
  const serviceKey = await sign(regionKey, "s3");
  const signingKey = await sign(serviceKey, "aws4_request");
  const signature = hex(await sign(signingKey, stringToSign));
  url.search = canonicalQuery + "&X-Amz-Signature=" + signature;
  return url.toString();
}

export type StorageUploadTarget = { signedUrl: string; token?: string; expiresInSeconds: number; method: "PUT" };

export async function createStorageUploadTarget(
  config: StorageDestinationConfiguration,
  key: string,
  expiresInSeconds = 900,
): Promise<StorageUploadTarget> {
  assertStorageObjectKey(key);
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 3600) throw new ApiError(400, "UPLOAD_EXPIRY_INVALID", "The upload authorization lifetime is invalid.");
  if (config.metadata.providerType === "backblaze_b2") {
    return { signedUrl: await b2Url(config, key, "PUT", expiresInSeconds), expiresInSeconds, method: "PUT" };
  }
  const c = credentials(config);
  if (!c.url || !c.serviceRoleKey) throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The storage destination is not configured.");
  const client = createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.storage.from(config.metadata.bucketName).createSignedUploadUrl(key, { upsert: false });
  if (error || !data?.signedUrl || !data.token) throw new ApiError(503, "STORAGE_UPLOAD_UNAVAILABLE", "A private upload session could not be created.");
  return { signedUrl: data.signedUrl, token: data.token, expiresInSeconds: 7200, method: "PUT" };
}

export async function inspectStorageObject(
  config: StorageDestinationConfiguration,
  key: string,
): Promise<{ sizeBytes: number; headerBytes: Uint8Array; contentType: string | null }> {
  assertStorageObjectKey(key);
  let signedUrl: string;
  if (config.metadata.providerType === "backblaze_b2") {
    signedUrl = await b2Url(config, key, "GET", 60);
  } else {
    const c = credentials(config);
    if (!c.url || !c.serviceRoleKey) throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The storage destination is not configured.");
    const client = createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await client.storage.from(config.metadata.bucketName).createSignedUrl(key, 60);
    if (error || !data?.signedUrl) throw new ApiError(503, "STORAGE_OBJECT_UNAVAILABLE", "The uploaded file could not be inspected.");
    signedUrl = data.signedUrl;
  }
  let response: Response;
  try {
    response = await fetch(signedUrl, { headers: { Range: "bytes=0-511" }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ApiError(503, "STORAGE_OBJECT_UNAVAILABLE", "The uploaded file could not be inspected.");
  }
  if (response.status !== 206) {
    await response.body?.cancel();
    throw new ApiError(409, "UPLOAD_OBJECT_MISSING", "The uploaded file could not be found or private storage did not support bounded inspection.");
  }
  const headerBytes = new Uint8Array(await response.arrayBuffer());
  if (headerBytes.byteLength > 512) throw new ApiError(502, "STORAGE_RANGE_UNSUPPORTED", "Private storage returned more data than the bounded inspection limit.");
  const total = response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
  const sizeBytes = total ? Number(total) : NaN;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) throw new ApiError(502, "STORAGE_SIZE_UNAVAILABLE", "The uploaded file size could not be verified.");
  return { sizeBytes, headerBytes, contentType: response.headers.get("content-type") };
}


export async function loadSourceStorageConfiguration(
  fs: import("../firebase-admin").Firestore,
  asset: Record<string, unknown>,
): Promise<import("./registry").StorageDestinationConfiguration> {
  const binding = resolveAssetStorageBinding(asset, "source", {
    source: "lovable-source-legacy", stream: "lovable-stream-legacy",
  });
  const destinationId = binding.primaryDestinationId;
  if (destinationId !== "lovable-source-legacy") {
    const raw = await fs.getDoc("storageDestinations/" + destinationId);
    if (!raw) throw new ApiError(503, "STORAGE_DESTINATION_MISSING", "The source storage destination is unavailable.");
    const { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } = await import("./registry");
    return resolveStorageDestinationConfiguration(validateStorageDestinationMetadata({ ...raw, destinationId }));
  }
  // Legacy assets remain readable from the original Lovable source bucket.
  const { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } = await import("./registry");
  const bucketName = typeof asset["sourceBucket"] === "string" ? asset["sourceBucket"] : "bq-sqwad-source-media";
  const legacy = validateStorageDestinationMetadata({
    destinationId: LEGACY_SOURCE_DESTINATION_ID,
    providerType: "lovable_storage",
    accountAlias: "Legacy Lovable source storage",
    secretPrefix: "SUPABASE",
    bucketName,
    region: "africa-south1",
    purpose: "source_media",
    softCapBytes: 5_000_000_000,
    dailyEgressCapBytes: 300_000_000,
    freeEgressBudgetBytes: 9_000_000_000,
    paidEgressEnabled: false,
    egressBudgetSource: "Conservative default: 2× soft cap shared across the legacy project group",
    egressBudgetCheckedAt: new Date().toISOString(),
    egressBudgetSourceUrl: null,
    priority: 0,
    enabled: true,
    accountGroup: "lovable-default-workspace",
    mode: "active",
    replicaOf: null,
  });
  return resolveStorageDestinationConfiguration(legacy, {
    ...process.env,
    SUPABASE_URL: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"],
  });
}


export async function createStorageDownloadTarget(
  config: StorageDestinationConfiguration,
  key: string,
  expiresInSeconds = 900,
): Promise<{ signedUrl: string; expiresInSeconds: number }> {
  assertStorageObjectKey(key);
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 3600) {
    throw new ApiError(400, "DOWNLOAD_EXPIRY_INVALID", "The download authorization lifetime is invalid.");
  }
  if (config.metadata.providerType === "backblaze_b2") {
    return { signedUrl: await b2Url(config, key, "GET", expiresInSeconds), expiresInSeconds };
  }
  const c = credentials(config);
  if (!c.url || !c.serviceRoleKey) throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The storage destination is not configured.");
  const client = createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.storage.from(config.metadata.bucketName).createSignedUrl(key, expiresInSeconds);
  if (error || !data?.signedUrl) throw new ApiError(503, "STORAGE_DOWNLOAD_UNAVAILABLE", "A private download authorization could not be created.");
  return { signedUrl: data.signedUrl, expiresInSeconds };
}


export async function loadStreamStorageConfiguration(
  fs: import("../firebase-admin").Firestore,
  asset: Record<string, unknown>,
  assetId?: string,
  sessionId?: string,
): Promise<StorageDestinationConfiguration> {
  const resolvedAssetId = assetId ??
    (typeof asset["assetId"] === "string" ? asset["assetId"] : typeof asset["id"] === "string" ? asset["id"] : "");
  if (!resolvedAssetId) throw new ApiError(400, "ASSET_ID_INVALID", "The content identifier is missing.");
  const binding = resolveAssetStreamBinding(asset, resolvedAssetId);
  const { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } = await import("./registry");
  const { choosePlaybackLocation, requirePlaybackLocation } = await import("./failover");

  const loadCandidate = async (destinationId: string): Promise<{
    destinationId: string;
    configuration: StorageDestinationConfiguration;
    healthStatus: string;
    mode: string;
    enabled: boolean;
    degradedUntil?: string | null;
  } | null> => {
    if (destinationId === LEGACY_STREAM_DESTINATION_ID) {
      const bucketName = typeof asset["streamBucket"] === "string" ? asset["streamBucket"] : "bq-sqwad-streaming-media";
      const metadata = validateStorageDestinationMetadata({
        destinationId: LEGACY_STREAM_DESTINATION_ID,
        providerType: "lovable_storage",
        accountAlias: "Legacy Lovable streaming storage",
        secretPrefix: "SUPABASE",
        bucketName,
        region: "africa-south1",
        purpose: "hls_streaming",
        softCapBytes: 4_500_000_000,
        accountCapBytes: 4_500_000_000,
        dailyEgressCapBytes: null,
        freeEgressBudgetBytes: 9_000_000_000,
        paidEgressEnabled: false,
        priority: 0,
        enabled: true,
        accountGroup: "lovable-default-workspace",
        mode: "active",
        replicaOf: null,
      });
      const configuration = resolveStorageDestinationConfiguration(metadata, {
        ...process.env,
        SUPABASE_URL: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"],
      });
      return {
        destinationId,
        configuration,
        healthStatus: "unknown",
        mode: "active",
        enabled: true,
      };
    }

    const raw = await fs.getDoc("storageDestinations/" + destinationId);
    if (!raw) return null;
    const metadata = validateStorageDestinationMetadata({ ...raw, destinationId });
    return {
      destinationId,
      configuration: resolveStorageDestinationConfiguration(metadata),
      healthStatus: metadata.healthStatus ?? "unknown",
      mode: metadata.mode,
      enabled: metadata.enabled,
      degradedUntil: typeof raw["degradedUntil"] === "string" ? raw["degradedUntil"] : null,
    };
  };

  const ids = [...new Set([binding.streamDestinationId, ...binding.streamReplicaIds])].slice(0, 9);
  const candidates = (await Promise.all(ids.map(loadCandidate))).filter(
    (item): item is NonNullable<typeof item> => item !== null &&
      item.configuration.configurationStatus === "configured",
  );
  let selectedDestinationId: string;
  const weightedCandidates = candidates.map(item => {
    const metadata = item.configuration.metadata;
    const budget = typeof metadata.freeEgressBudgetBytes === "number"
      ? metadata.freeEgressBudgetBytes
      : typeof metadata.accountCapBytes === "number" ? metadata.accountCapBytes * 2 : null;
    const used = typeof metadata.egressAccountMonthBytes === "number"
      ? metadata.egressAccountMonthBytes : metadata.egressMonthBytes ?? 0;
    return {
      destinationId: item.destinationId,
      healthStatus: item.healthStatus === "healthy" ? "healthy" as const :
        item.healthStatus === "degraded" ? "degraded" as const :
          item.healthStatus === "unreachable" ? "unreachable" as const :
            item.healthStatus === "misconfigured" ? "misconfigured" as const : "unknown" as const,
      egressLevel: metadata.egressLevel === "normal" || metadata.egressLevel === "warn" ||
        metadata.egressLevel === "throttle" || metadata.egressLevel === "blocked" || metadata.egressLevel === "paid"
        ? metadata.egressLevel : "unknown" as const,
      remainingEgressBytes: budget === null ? 0 : Math.max(0, budget - used),
      enabled: item.enabled && item.mode === "active",
    };
  });
  const weightedAssignment = sessionId
    ? chooseReplicaForSession({ sessionId, assetId: resolvedAssetId, candidates: weightedCandidates })
    : null;
  if (weightedAssignment) {
    selectedDestinationId = weightedAssignment.destinationId;
  } else {
    const selected = requirePlaybackLocation(choosePlaybackLocation(
      candidates.map(item => ({
        destinationId: item.destinationId,
        healthStatus: item.healthStatus,
        mode: item.mode,
        enabled: item.enabled,
        degradedUntil: item.degradedUntil ?? null,
      })).find(item => item.destinationId === binding.streamDestinationId) ?? {
        destinationId: binding.streamDestinationId,
        healthStatus: "unreachable",
        mode: "retired",
        enabled: false,
      },
      candidates.filter(item => item.destinationId !== binding.streamDestinationId).map(item => ({
        destinationId: item.destinationId,
        healthStatus: item.healthStatus,
        mode: item.mode,
        enabled: item.enabled,
        degradedUntil: item.degradedUntil ?? null,
      })),
    ));
    selectedDestinationId = selected.destinationId;
  }
  const configuration = candidates.find(item => item.destinationId === selectedDestinationId)?.configuration;
  if (!configuration || configuration.configurationStatus !== "configured") {
    throw new ApiError(503, "STREAM_REPLICAS_UNAVAILABLE", "This title is temporarily unavailable while its streaming locations are checked.");
  }
  return configuration;
}
