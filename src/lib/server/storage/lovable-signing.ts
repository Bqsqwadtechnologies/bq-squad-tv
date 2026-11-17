import { createClient } from "@supabase/supabase-js";
import { ApiError } from "../firebase-admin";
import { assertStorageObjectKey } from "./ledger";
import type { StorageDestinationConfiguration } from "./registry";

const MAX_BATCH_SIZE = 500;
const MAX_TTL_SECONDS = 6 * 60 * 60;

export type SignedObjectResult = {
  objectKey: string;
  signedUrl: string | null;
  error: string | null;
};

function isAllowedHlsObject(key: string): boolean {
  const name = key.split("/").pop()?.toLowerCase() ?? "";
  return /^(?:master|index|variant(?:_[a-z0-9_-]+)?)\.m3u8$/.test(name) ||
    /^segment_[0-9]{5}\.(?:ts|m4s)$/.test(name) ||
    /^init\.mp4$/.test(name) ||
    /^subtitle_[a-z0-9_-]+\.vtt$/.test(name) ||
    /^(?:encryption|stream)_[a-z0-9_-]+\.(?:key|keyinfo)$/.test(name);
}

function createSigningClient(configuration: StorageDestinationConfiguration) {
  const credentials = configuration.credentials;
  if (configuration.configurationStatus !== "configured" ||
      configuration.metadata.providerType !== "lovable_storage" ||
      !credentials?.url || !credentials.serviceRoleKey) {
    throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The managed storage location is not configured.");
  }
  return createClient(credentials.url, credentials.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from(configuration.metadata.bucketName);
}

/**
 * Requests signed URLs in bounded batches. Individual provider failures are
 * returned alongside successful URLs so a playlist builder can retry only
 * failed objects without losing the successful batch results.
 */
export async function createLovableHlsSignedUrls(input: {
  configuration: StorageDestinationConfiguration;
  objectKeys: string[];
  expiresInSeconds: number;
  batchSize?: number;
}): Promise<SignedObjectResult[]> {
  if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 1 ||
      input.expiresInSeconds > MAX_TTL_SECONDS) {
    throw new ApiError(400, "STORAGE_SIGNED_URL_TTL_INVALID", "The signed link lifetime is outside the allowed range.");
  }
  const batchSize = input.batchSize ?? MAX_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new ApiError(400, "STORAGE_SIGNED_URL_BATCH_INVALID", "The signed URL batch size is invalid.");
  }
  const keys = input.objectKeys.map(key => {
    let safeKey: string;
    try { safeKey = assertStorageObjectKey(key); } catch {
      throw new ApiError(400, "STORAGE_SIGNED_URL_PATH_INVALID", "A storage object path is invalid.");
    }
    if (!isAllowedHlsObject(safeKey)) {
      throw new ApiError(403, "STORAGE_SIGNED_URL_TYPE_FORBIDDEN", "Only HLS playlists, segments, key information and subtitles can be signed.");
    }
    return safeKey;
  });
  if (keys.length > 20_000) {
    throw new ApiError(413, "STORAGE_SIGNED_URL_BATCH_TOO_LARGE", "The requested playlist contains too many objects to sign at once.");
  }
  const bucket = createSigningClient(input.configuration);
  const results: SignedObjectResult[] = [];
  for (let offset = 0; offset < keys.length; offset += batchSize) {
    const batch = keys.slice(offset, offset + batchSize);
    try {
      const { data, error } = await bucket.createSignedUrls(batch, input.expiresInSeconds);
      if (error) {
        for (const objectKey of batch) results.push({ objectKey, signedUrl: null, error: "provider_batch_failed" });
        continue;
      }
      const byPath = new Map((data ?? []).map(item => [
        item.path,
        typeof item.signedUrl === "string" && item.signedUrl.startsWith("https://") ? item.signedUrl : null,
      ]));
      for (const objectKey of batch) {
        const signedUrl = byPath.get(objectKey) ?? null;
        results.push({
          objectKey,
          signedUrl,
          error: signedUrl ? null : "provider_item_failed",
        });
      }
    } catch {
      for (const objectKey of batch) results.push({ objectKey, signedUrl: null, error: "provider_batch_failed" });
    }
  }
  return results;
}
