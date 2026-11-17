import { ApiError } from "../firebase-admin";

export type StorageListingObject = { key: string; sizeBytes: number };

export function accumulateStorageUsage(
  currentBytes: number,
  currentObjectCount: number,
  objects: StorageListingObject[],
): { usageBytes: number; objectCount: number } {
  if (!Number.isSafeInteger(currentBytes) || currentBytes < 0 ||
      !Number.isSafeInteger(currentObjectCount) || currentObjectCount < 0) {
    throw new ApiError(409, "STORAGE_USAGE_COUNTER_INVALID", "The storage usage report is invalid.");
  }
  let usageBytes = currentBytes;
  let objectCount = currentObjectCount;
  for (const object of objects) {
    if (!object || typeof object.key !== "string" || !object.key ||
        !Number.isSafeInteger(object.sizeBytes) || object.sizeBytes < 0) {
      throw new ApiError(409, "STORAGE_LISTING_INVALID", "The provider returned an invalid storage listing.");
    }
    usageBytes += object.sizeBytes;
    objectCount += 1;
    if (!Number.isSafeInteger(usageBytes) || !Number.isSafeInteger(objectCount)) {
      throw new ApiError(409, "STORAGE_USAGE_COUNTER_OVERFLOW", "The storage usage report is too large.");
    }
  }
  return { usageBytes, objectCount };
}

export function storageFailureCode(error: unknown): string {
  if (error instanceof ApiError) return error.code;
  return "STORAGE_PROVIDER_UNAVAILABLE";
}

export function isStorageQuotaOrRateLimit(code: string): boolean {
  return code === "STORAGE_PROVIDER_PAYMENT_REQUIRED" ||
    code === "STORAGE_PROVIDER_RATE_LIMITED" ||
    code === "STORAGE_PROVIDER_QUOTA";
}

export function storageFailureMessage(code: string): string {
  if (code === "STORAGE_PROVIDER_PAYMENT_REQUIRED") return "The storage account needs an allowance review.";
  if (code === "STORAGE_PROVIDER_RATE_LIMITED") return "The storage provider temporarily limited requests.";
  if (code === "STORAGE_PROVIDER_QUOTA") return "The storage provider reports that its allowance is exhausted.";
  if (code === "STORAGE_PROVIDER_PERMISSION_DENIED") return "The storage provider denied access.";
  return "The storage location could not be checked.";
}


export async function reconcileStorageUsage(
  adapter: {
    listObjects(prefix: string, cursor: string | null): Promise<{
      objects: StorageListingObject[];
      nextCursor: string | null;
    }>;
  },
  limits: { maxPages?: number; maxObjects?: number } = {},
): Promise<{ usageBytes: number; objectCount: number }> {
  const maxPages = limits.maxPages ?? 10_000;
  const maxObjects = limits.maxObjects ?? 10_000_000;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 ||
      !Number.isSafeInteger(maxObjects) || maxObjects < 1) {
    throw new ApiError(400, "STORAGE_RECONCILE_LIMIT_INVALID", "The storage reconciliation limit is invalid.");
  }
  let cursor: string | null = null;
  let usageBytes = 0;
  let objectCount = 0;
  const cursors = new Set<string>();
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const page = await adapter.listObjects("", cursor);
    const totals = accumulateStorageUsage(usageBytes, objectCount, page.objects);
    usageBytes = totals.usageBytes;
    objectCount = totals.objectCount;
    if (objectCount > maxObjects) {
      throw new ApiError(413, "STORAGE_RECONCILE_OBJECT_LIMIT", "The storage location contains more objects than one reconciliation can safely inspect.");
    }
    if (!page.nextCursor) return { usageBytes, objectCount };
    if (cursors.has(page.nextCursor) || page.nextCursor === cursor) {
      throw new ApiError(409, "STORAGE_LISTING_CURSOR_STALLED", "The storage listing did not advance.");
    }
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new ApiError(413, "STORAGE_RECONCILE_PAGE_LIMIT", "The storage location needs more than one safe reconciliation pass.");
}
