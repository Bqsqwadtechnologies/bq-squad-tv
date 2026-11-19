import type { StoragePurpose } from "./registry";

export type StorageCandidate = {
  id: string;
  priority: number;
  purpose: StoragePurpose | string;
  usageBytes: number | null;
  softCapBytes: number;
  healthStatus: string;
  mode: string;
  configured: boolean;
  egressHeadroomBytes: number | null;
  egressCircuitBreakerBytes?: number;
  accountGroup: string;
  accountGroupUsedBytes: number;
  accountGroupCapBytes: number;
};

export type DestinationPick = { id: string; nextCursor: number };

/**
 * Selects from the lowest numbered priority group with available capacity.
 * The caller stores nextCursor in storageRouting/{purpose}; each package advances
 * one position within that group. Full or unavailable entries are skipped and
 * lower-priority groups are considered only after higher-priority groups have
 * no eligible capacity. Unknown usage and egress are never treated as zero.
 */
export function pickDestination(
  candidates: StorageCandidate[],
  incomingBytes: number,
  purpose: string,
  cursor: number,
): DestinationPick | null {
  if (!Number.isSafeInteger(incomingBytes) || incomingBytes < 0 || candidates.length === 0)
    return null;

  const eligible = candidates.filter((candidate) => {
    if (
      candidate.purpose !== purpose ||
      candidate.mode !== "active" ||
      candidate.healthStatus !== "healthy" ||
      !candidate.configured ||
      candidate.usageBytes === null ||
      !Number.isSafeInteger(candidate.usageBytes) ||
      candidate.usageBytes < 0 ||
      !Number.isSafeInteger(candidate.softCapBytes) ||
      candidate.usageBytes + incomingBytes > candidate.softCapBytes ||
      !Number.isSafeInteger(candidate.accountGroupUsedBytes) ||
      !Number.isSafeInteger(candidate.accountGroupCapBytes) ||
      candidate.accountGroupUsedBytes + incomingBytes > candidate.accountGroupCapBytes
    )
      return false;

    if (purpose === "hls_streaming") {
      if (
        candidate.egressHeadroomBytes === null ||
        !Number.isSafeInteger(candidate.egressHeadroomBytes)
      )
        return false;
      const breaker = candidate.egressCircuitBreakerBytes ?? 0;
      if (candidate.egressHeadroomBytes < breaker) return false;
    }
    return true;
  });

  if (eligible.length === 0) return null;
  const priorities = [...new Set(eligible.map((item) => item.priority))].sort((a, b) => a - b);
  for (const priority of priorities) {
    const group = eligible
      .filter((item) => item.priority === priority)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (group.length === 0) continue;
    const start = ((Math.trunc(cursor) % group.length) + group.length) % group.length;
    const chosen = group[start];
    if (chosen) return { id: chosen.id, nextCursor: (start + 1) % group.length };
  }
  return null;
}

export function estimateReservedBytes(sourceBytes: number, profileFactor: number): number {
  if (
    !Number.isSafeInteger(sourceBytes) ||
    sourceBytes < 1 ||
    !Number.isFinite(profileFactor) ||
    profileFactor <= 0
  ) {
    throw new RangeError("Invalid storage estimate.");
  }
  const estimate = Math.ceil(sourceBytes * profileFactor * 1.1);
  if (!Number.isSafeInteger(estimate)) throw new RangeError("Storage estimate is too large.");
  return estimate;
}

export function calculateB2FreeEgressBudget(averageStoredBytes: number): number {
  if (!Number.isSafeInteger(averageStoredBytes) || averageStoredBytes < 0) {
    throw new RangeError("Invalid average stored bytes.");
  }
  return Math.floor(averageStoredBytes * 3 * 0.8);
}

export function calculateEgressState(
  usedBytes: number,
  budgetBytes: number,
): "normal" | "warn" | "throttle" | "blocked" {
  if (
    !Number.isSafeInteger(usedBytes) ||
    usedBytes < 0 ||
    !Number.isSafeInteger(budgetBytes) ||
    budgetBytes < 0
  ) {
    throw new RangeError("Invalid egress counters.");
  }
  if (budgetBytes === 0 || usedBytes >= budgetBytes * 0.95) return "blocked";
  if (usedBytes >= budgetBytes * 0.85) return "throttle";
  if (usedBytes >= budgetBytes * 0.7) return "warn";
  return "normal";
}
