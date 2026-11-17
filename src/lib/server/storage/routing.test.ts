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

  it("round-robins across 400 candidates and wraps without rescanning the pool", () => {
    const pool = Array.from({ length: 400 }, (_, index) =>
      candidate("lov-" + String(index + 1).padStart(3, "0")));
    const first = pickDestination(pool, 1, "source_media", 0);
    expect(first?.id).toBe("lov-001");
    expect(first?.nextCursor).toBe(1);
    const wrapped = pickDestination(pool, 1, "source_media", 399);
    expect(wrapped?.id).toBe("lov-400");
    expect(wrapped?.nextCursor).toBe(0);
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
      candidate("zero-known-egress", { purpose: "hls_streaming", egressHeadroomBytes: 0 }),
    ], 1, "hls_streaming", 0)?.id).toBe("zero-known-egress");
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


describe("large-pool round robin", () => {
  it("rotates through 400 eligible destinations before wrapping", () => {
    const pool = Array.from({ length: 400 }, (_, index) =>
      candidate("lov-" + String(index + 1).padStart(3, "0")));
    let cursor = 0;
    const picks: string[] = [];
    for (let index = 0; index < 800; index++) {
      const selected = pickDestination(pool, 1, "source_media", cursor);
      expect(selected).toBeTruthy();
      picks.push(selected!.id);
      cursor = selected!.nextCursor;
    }
    expect(picks.slice(0, 400)).toEqual(pool.map(item => item.id));
    expect(picks.slice(400)).toEqual(pool.map(item => item.id));
  });

  it("skips a full shared group and continues to the next priority group", () => {
    const pool = [
      candidate("lov-001", { priority: 1, accountGroup: "lovable:project-a", accountGroupUsedBytes: 100, accountGroupCapBytes: 100 }),
      candidate("lov-002", { priority: 1, accountGroup: "lovable:project-a", accountGroupUsedBytes: 100, accountGroupCapBytes: 100 }),
      candidate("b2-001", { priority: 2, accountGroup: "b2:account-01" }),
    ];
    expect(pickDestination(pool, 1, "source_media", 0)?.id).toBe("b2-001");
  });
});


describe("priority-group package rotation", () => {
  it("keeps the cursor within the available priority group", () => {
    const pool = [
      candidate("01", { priority: 1 }),
      candidate("02", { priority: 1 }),
      candidate("03", { priority: 2 }),
    ];
    const first = pickDestination(pool, 1, "source_media", 0)!;
    const second = pickDestination(pool, 1, "source_media", first.nextCursor)!;
    expect([first.id, second.id]).toEqual(["01", "02"]);
    expect(first.nextCursor).toBe(1);
    expect(second.nextCursor).toBe(0);
  });

  it("uses the next priority only when every destination in the earlier group is full", () => {
    const pool = [
      candidate("01", { priority: 1, usageBytes: 100 }),
      candidate("02", { priority: 1, mode: "drain" }),
      candidate("03", { priority: 2 }),
    ];
    expect(pickDestination(pool, 1, "source_media", 0)?.id).toBe("03");
  });
});
