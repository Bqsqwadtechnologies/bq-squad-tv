export type ReplicaCandidate = {
  destinationId: string;
  healthStatus: "healthy" | "degraded" | "unreachable" | "unknown" | "misconfigured";
  egressLevel: "normal" | "warn" | "throttle" | "blocked" | "paid" | "unknown";
  remainingEgressBytes: number;
  enabled: boolean;
};

export type ReplicaAssignment = {
  destinationId: string;
  eligibleCount: number;
  selectionWeight: number;
};

function stableHash(value: string): number {
  // FNV-1a 32-bit: deterministic across runtimes and does not require crypto.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Selects a replica deterministically for a session. Normal destinations are
 * preferred whenever any are available; otherwise only healthy, non-blocked
 * destinations with positive measured headroom may receive a new assignment.
 */
export function chooseReplicaForSession(input: {
  sessionId: string;
  assetId: string;
  candidates: ReplicaCandidate[];
}): ReplicaAssignment | null {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(input.sessionId) ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(input.assetId)) return null;

  const eligible = input.candidates.filter(candidate =>
    candidate.enabled &&
    /^[a-z0-9][a-z0-9_-]{1,79}$/.test(candidate.destinationId) &&
    candidate.healthStatus === "healthy" &&
    Number.isSafeInteger(candidate.remainingEgressBytes) &&
    candidate.remainingEgressBytes > 0 &&
    candidate.egressLevel !== "blocked" &&
    candidate.egressLevel !== "paid",
  );
  if (eligible.length === 0) return null;

  const normal = eligible.filter(candidate => candidate.egressLevel === "normal");
  const pool = normal.length > 0
    ? normal
    : eligible.filter(candidate => candidate.egressLevel === "warn");
  if (pool.length === 0) return null;

  // Keep weights bounded while preserving relative headroom.
  const maxHeadroom = Math.max(...pool.map(candidate => candidate.remainingEgressBytes));
  const weighted = pool.map(candidate => ({
    candidate,
    weight: Math.max(1, Math.min(1_000_000, Math.floor(
      candidate.remainingEgressBytes / Math.max(1, maxHeadroom / 1_000_000),
    ))),
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const slot = stableHash(input.sessionId + ":" + input.assetId) % totalWeight;
  let cursor = slot;
  for (const item of weighted) {
    if (cursor < item.weight) {
      return {
        destinationId: item.candidate.destinationId,
        eligibleCount: pool.length,
        selectionWeight: item.weight,
      };
    }
    cursor -= item.weight;
  }
  return null;
}
