import { ApiError } from "../firebase-admin";

export type OrphanReview = { key: string; firstSeenAt: string; confirmingRunAt?: string | null };

export function confirmOrphanDeletion(
  orphan: OrphanReview,
  now = Date.now(),
): boolean {
  const first = Date.parse(orphan.firstSeenAt);
  const second = orphan.confirmingRunAt ? Date.parse(orphan.confirmingRunAt) : NaN;
  if (!orphan.key || !Number.isFinite(first) || !Number.isFinite(second) ||
      second <= first || now - second < 24 * 60 * 60_000) return false;
  return true;
}

export function isExpiredTemporaryObject(createdAt: string, now = Date.now()): boolean {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && now - created >= 24 * 60 * 60_000;
}

export function sourceCanBeDeleted(input: {
  publishedAt?: string | null;
  pinned?: boolean;
  graceDays?: number;
}, now = Date.now()): boolean {
  if (input.pinned || !input.publishedAt) return false;
  const published = Date.parse(input.publishedAt);
  const days = input.graceDays ?? 7;
  if (!Number.isFinite(published) || !Number.isSafeInteger(days) || days < 1 || days > 365) {
    throw new ApiError(400, "STORAGE_RETENTION_POLICY_INVALID", "The file retention period is invalid.");
  }
  return now - published >= days * 86_400_000;
}
