import { describe, expect, it } from "vitest";
import {
  calculateEgressState,
  calculateB2FreeEgressBudget,
  estimateReservedBytes,
  pickDestination,
  type StorageCandidate,
} from "./routing";

function candidate(id: string, extra: Partial<StorageCandidate> = {}): StorageCandidate {
  return {
    id, priority: 1, purpose: "source_media", usageBytes: 0,
    softCapBytes: 100, healthStatus: "healthy", mode: "active",
    configured: true, egressHeadroomBytes: 100, egressCircuitBreakerBytes: 0,
    accountGroup: id, accountGroupUsedBytes: 0, accountGroupCapBytes: 100,
    ...extra,
  };
}

describe("storage destination selection", () => {
  it("rotates evenly and wraps its cursor", () => {
    const pool = Array.from({ length: 11 }, (_, i) => candidate("b2-" + String(i + 1).padStart(2, "0")));
    let cursor = 0;
    const picks: string[] = [];
    for (let i = 0; i < 22; i++) {
      const result = pickDestination(pool, 1, "source_media", cursor)!;
      picks.push(result.id);
      cursor = result.nextCursor;
    }
    expect(picks.slice(0, 11)).toEqual(pool.map(item => item.id));
    expect(picks.slice(11)).toEqual(pool.map(item => item.id));
  });

  it("skips full, draining, retired, unhealthy and unconfigured destinations", () => {
    const pool = [
      candidate("01", { usageBytes: 100 }),
      candidate("02", { mode: "drain" }),
      candidate("03", { mode: "retired" }),
      candidate("04", { healthStatus: "degraded" }),
      candidate("05", { configured: false }),
      candidate("06"),
    ];
    expect(pickDestination(pool, 1, "source_media", 0)?.id).toBe("06");
  });

  it("falls through priority groups and enforces shared account caps", () => {
    const pool = [
      candidate("01", { priority: 0, accountGroup: "shared", accountGroupUsedBytes: 99, accountGroupCapBytes: 100 }),
      candidate("02", { priority: 0, accountGroup: "shared", accountGroupUsedBytes: 99, accountGroupCapBytes: 100 }),
      candidate("03", { priority: 2 }),
    ];
    expect(pickDestination(pool, 2, "source_media", 0)?.id).toBe("03");
  });

  it("excludes unknown usage and requires streaming egress headroom", () => {
    expect(pickDestination([
      candidate("unknown", { usageBytes: null }),
      candidate("no-egress", { purpose: "hls_streaming", egressHeadroomBytes: null }),
    ], 1, "source_media", 0)).toBeNull();
    expect(pickDestination([
      candidate("no-egress", { purpose: "hls_streaming", egressHeadroomBytes: 0 }),
    ], 1, "hls_streaming", 0)).toBeNull();
  });

  it("returns null when every candidate is full", () => {
    expect(pickDestination([candidate("01", { usageBytes: 100 })], 1, "source_media", 0)).toBeNull();
  });

  it("uses the next eligible candidate after cursor wrap", () => {
    const pool = [candidate("01"), candidate("02"), candidate("03")];
    expect(pickDestination(pool, 1, "source_media", 2)).toEqual({ id: "03", nextCursor: 0 });
  });
});

describe("storage capacity and egress math", () => {
  it("reserves 10 percent above estimated profile output", () => {
    expect(estimateReservedBytes(1_000, 2.5)).toBe(2_750);
  });
  it("applies an 80 percent safety factor to B2's 3x allowance", () => {
    expect(calculateB2FreeEgressBudget(1_000)).toBe(2_400);
  });
  it("maps egress use to the circuit breaker thresholds", () => {
    expect(calculateEgressState(69, 100)).toBe("normal");
    expect(calculateEgressState(70, 100)).toBe("warn");
    expect(calculateEgressState(85, 100)).toBe("throttle");
    expect(calculateEgressState(95, 100)).toBe("blocked");
  });
});
