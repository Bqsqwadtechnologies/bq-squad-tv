import { describe, expect, it } from "vitest";
import { chooseReplicaForSession, type ReplicaCandidate } from "./replica-assignment";

const candidate = (destinationId: string, remainingEgressBytes = 1_000_000): ReplicaCandidate => ({
  destinationId,
  healthStatus: "healthy",
  egressLevel: "normal",
  remainingEgressBytes,
  enabled: true,
});

describe("chooseReplicaForSession", () => {
  it("is deterministic for the same session and asset", () => {
    const candidates = [candidate("storage_a"), candidate("storage_b")];
    expect(chooseReplicaForSession({ sessionId: "session-1", assetId: "asset-1", candidates }))
      .toEqual(chooseReplicaForSession({ sessionId: "session-1", assetId: "asset-1", candidates }));
  });

  it("spreads independent sessions across healthy replicas", () => {
    const candidates = [candidate("storage_a"), candidate("storage_b"), candidate("storage_c")];
    const counts = new Map(candidates.map(item => [item.destinationId, 0]));
    for (let index = 0; index < 900; index++) {
      const selected = chooseReplicaForSession({
        sessionId: "session-" + index,
        assetId: "asset-1",
        candidates,
      });
      if (selected) counts.set(selected.destinationId, (counts.get(selected.destinationId) ?? 0) + 1);
    }
    for (const count of counts.values()) expect(count).toBeGreaterThan(150);
  });

  it("weights selection by remaining free delivery headroom", () => {
    const candidates = [candidate("small", 100), candidate("large", 900)];
    let large = 0;
    for (let index = 0; index < 1000; index++) {
      const selected = chooseReplicaForSession({
        sessionId: "weighted-" + index,
        assetId: "asset-1",
        candidates,
      });
      if (selected?.destinationId === "large") large++;
    }
    expect(large).toBeGreaterThan(700);
  });

  it("avoids warn destinations when a normal destination exists", () => {
    const candidates: ReplicaCandidate[] = [
      candidate("normal"),
      { ...candidate("warn"), egressLevel: "warn" },
    ];
    expect(chooseReplicaForSession({ sessionId: "session-2", assetId: "asset-1", candidates })?.destinationId)
      .toBe("normal");
  });

  it("never assigns unhealthy or blocked destinations", () => {
    const candidates: ReplicaCandidate[] = [
      { ...candidate("degraded"), healthStatus: "degraded" },
      { ...candidate("blocked"), egressLevel: "blocked" },
    ];
    expect(chooseReplicaForSession({ sessionId: "session-3", assetId: "asset-1", candidates })).toBeNull();
  });
});
