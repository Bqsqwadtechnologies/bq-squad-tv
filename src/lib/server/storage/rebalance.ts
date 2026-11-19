import { ApiError } from "../firebase-admin";

export type RebalancePhase = "copy_pending" | "copied" | "switched" | "deleted" | "blocked";

export function nextRebalancePhase(
  phase: RebalancePhase,
  event: "copy_verified" | "asset_switched" | "old_copy_deleted" | "copy_failed",
): RebalancePhase {
  if (event === "copy_failed") return phase === "copy_pending" ? "blocked" : phase;
  if (phase === "copy_pending" && event === "copy_verified") return "copied";
  if (phase === "copied" && event === "asset_switched") return "switched";
  if (phase === "switched" && event === "old_copy_deleted") return "deleted";
  throw new ApiError(
    409,
    "STORAGE_REBALANCE_TRANSITION_INVALID",
    "The storage move cannot advance from its current verified step.",
  );
}

export function mayDeleteOldRebalanceCopy(
  phase: RebalancePhase,
  verifiedNewCopy: boolean,
): boolean {
  return phase === "switched" && verifiedNewCopy;
}

export function chooseColdAssets<T extends { lastWatchedAt?: string | null }>(
  assets: T[],
  limit: number,
): T[] {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new ApiError(400, "STORAGE_REBALANCE_LIMIT_INVALID", "The move limit is invalid.");
  return [...assets]
    .sort(
      (a, b) => (Date.parse(a.lastWatchedAt ?? "") || 0) - (Date.parse(b.lastWatchedAt ?? "") || 0),
    )
    .slice(0, limit);
}
