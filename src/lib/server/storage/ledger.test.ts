import { describe, expect, it } from "vitest";
import { assertStorageObjectKey, calculateB2MonthlyFreeEgressBudget, calculateEgressLevel, resolveDestinationId, storageAccountEgressId, storageLedgerShard } from "./ledger";

describe("storage ledger helpers", () => {
  it("maps deterministic keys into twenty shards", () => {
    expect(storageLedgerShard("asset-1")).toBe(storageLedgerShard("asset-1"));
    expect(storageLedgerShard("asset-1")).toBeGreaterThanOrEqual(0);
    expect(storageLedgerShard("asset-1")).toBeLessThan(20);
  });
  it("applies 70/85/95 percent circuit breaker thresholds", () => {
    expect(calculateEgressLevel(69, 100)).toBe("normal");
    expect(calculateEgressLevel(70, 100)).toBe("warn");
    expect(calculateEgressLevel(85, 100)).toBe("throttle");
    expect(calculateEgressLevel(95, 100)).toBe("blocked");
    expect(calculateEgressLevel(95, 100, true)).toBe("paid");
    expect(calculateEgressLevel(100, 100, true)).toBe("paid");
  });
  it("calculates conservative B2 monthly budget", () => expect(calculateB2MonthlyFreeEgressBudget(10_000)).toBe(24_000));
  it("creates stable, account-scoped egress ledger keys", () => {
    expect(storageAccountEgressId("b2:account-01")).toBe(storageAccountEgressId("b2:account-01"));
    expect(storageAccountEgressId("b2:account-01")).not.toBe(storageAccountEgressId("b2:account-02"));
    expect(() => storageAccountEgressId("../bad")).toThrow();
  });
  it("rejects traversal keys", () => { expect(() => assertStorageObjectKey("../private")).toThrow(); expect(assertStorageObjectKey("hls/a/master.m3u8")).toBe("hls/a/master.m3u8"); });
  it("resolves legacy assets without migration", () => {
    expect(resolveDestinationId({}, "source", { source: "lov-legacy-source", stream: "lov-legacy-stream" })).toBe("lov-legacy-source");
    expect(resolveDestinationId({ streamDestinationId: "b2-01" }, "stream", { source: "lov-legacy-source", stream: "lov-legacy-stream" })).toBe("b2-01");
  });
});
