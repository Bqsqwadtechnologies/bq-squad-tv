import { ApiError, Firestore } from "../firebase-admin";
import { refreshStoragePoolDestination } from "./pool-index";
import type { StorageProviderAdapter } from "./providers";

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

export async function markStorageDestinationDegraded(
  fs: Firestore,
  destinationId: string,
  error: unknown,
): Promise<boolean> {
  const code = storageFailureCode(error);
  if (!isStorageQuotaOrRateLimit(code)) return false;
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(destinationId)) return false;
  const destinationPath = "storageDestinations/" + destinationId;
  const destination = await fs.getDoc(destinationPath);
  if (!destination) return false;
  const now = new Date().toISOString();
  const degradedUntil = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const message = storageFailureMessage(code);
  await fs.patchDoc(destinationPath, {
    healthStatus: "degraded",
    healthCheckedAt: now,
    lastErrorCode: code,
    lastErrorMessage: message,
    degradedUntil,
    updatedAt: now,
  });
  await refreshStoragePoolDestination(fs, destinationId).catch(() => undefined);
  await fs.setDoc("storageAlerts/" + crypto.randomUUID().replace(/-/g, ""), {
    destinationId,
    accountGroup: typeof destination["accountGroup"] === "string" ? destination["accountGroup"] : null,
    severity: "warning",
    reasonCode: code,
    message,
    createdAt: now,
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    acknowledged: false,
  }).catch(() => undefined);
  return true;
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

export async function checkStorageProviderHealth(
  adapter: Pick<StorageProviderAdapter, "healthCheck">,
): Promise<{ healthy: true }> {
  return adapter.healthCheck();
}

export async function readStorageUsagePage(
  adapter: Pick<StorageProviderAdapter, "listObjects">,
  cursor: string | null,
  currentBytes: number,
  currentObjectCount: number,
): Promise<{ usageBytes: number; objectCount: number; nextCursor: string | null }> {
  const page = await adapter.listObjects("", cursor);
  if (page.nextCursor && page.nextCursor === cursor) {
    throw new ApiError(409, "STORAGE_LISTING_CURSOR_STALLED", "The storage listing did not advance.");
  }
  const totals = accumulateStorageUsage(currentBytes, currentObjectCount, page.objects);
  return { ...totals, nextCursor: page.nextCursor };
}
