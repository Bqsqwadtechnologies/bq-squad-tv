import type { StorageProviderAdapter } from "./providers";
import { ApiError } from "../firebase-admin";

export async function listAllStorageObjects(
  adapter: Pick<StorageProviderAdapter, "listObjects">,
  prefix: string,
  limits: { maxPages?: number; maxObjects?: number } = {},
): Promise<Array<{ key: string; sizeBytes: number }>> {
  const maxPages = limits.maxPages ?? 30;
  const maxObjects = limits.maxObjects ?? 20_000;
  const objects: Array<{ key: string; sizeBytes: number }> = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  do {
    if (++pages > maxPages) throw new ApiError(503, "HLS_LISTING_LIMIT", "The HLS output contains too many storage listing pages.");
    const page = await adapter.listObjects(prefix, cursor);
    for (const item of page.objects) {
      if (!item.key.startsWith(prefix.replace(/\/$/, "") + "/") ||
          !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 0 || seen.has(item.key)) {
        throw new ApiError(409, "HLS_LISTING_INVALID", "The storage listing contains an invalid or duplicate object.");
      }
      seen.add(item.key);
      objects.push(item);
      if (objects.length > maxObjects) throw new ApiError(413, "HLS_OUTPUT_TOO_LARGE", "The HLS output contains too many files.");
    }
    cursor = page.nextCursor;
  } while (cursor);
  return objects;
}
