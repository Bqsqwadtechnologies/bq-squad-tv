import { describe, expect, it } from "vitest";
import {
  assertStorageObjectKey,
  calculateB2MonthlyFreeEgressBudget,
  calculateB2DailyFreeEgressBudget,
  calculateEgressLevel,
  resolveAssetStorageBinding,
  resolveDestinationId,
  storageAccountEgressId,
  storageLedgerShard,
} from "./ledger";

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
    expect(calculateEgressLevel(95, 100, true)).toBe("blocked");
    expect(calculateEgressLevel(100, 100, true)).toBe("blocked");
  });
  it("calculates conservative B2 monthly budget", () =>
    expect(calculateB2MonthlyFreeEgressBudget(10_000)).toBe(24_000));
  it("creates stable, account-scoped egress ledger keys", () => {
    expect(storageAccountEgressId("b2:account-01")).toBe(storageAccountEgressId("b2:account-01"));
    expect(storageAccountEgressId("b2:account-01")).not.toBe(
      storageAccountEgressId("b2:account-02"),
    );
    expect(() => storageAccountEgressId("../bad")).toThrow();
  });
  it("rejects traversal keys", () => {
    expect(() => assertStorageObjectKey("../private")).toThrow();
    expect(assertStorageObjectKey("hls/a/master.m3u8")).toBe("hls/a/master.m3u8");
  });
  it("resolves legacy assets without migration", () => {
    expect(
      resolveDestinationId({}, "source", {
        source: "lov-legacy-source",
        stream: "lov-legacy-stream",
      }),
    ).toBe("lov-legacy-source");
    expect(
      resolveDestinationId({ streamDestinationId: "b2-01" }, "stream", {
        source: "lov-legacy-source",
        stream: "lov-legacy-stream",
      }),
    ).toBe("b2-01");
  });
});

describe("asset storage binding", () => {
  const legacy = {
    source: "lovable-source-legacy",
    stream: "lovable-stream-legacy",
    poster: "lovable-poster-legacy",
  };

  it("resolves the primary stream destination, deduplicated replicas and object prefix", () => {
    expect(
      resolveAssetStorageBinding(
        {
          streamDestinationId: "b2-primary",
          streamReplicaIds: ["b2-replica-1", "b2-replica-1", "INVALID ID", "b2-primary"],
          objectPrefix: "hls/asset-1/a1",
        },
        "stream",
        legacy,
      ),
    ).toEqual({
      primaryDestinationId: "b2-primary",
      replicaIds: ["b2-replica-1"],
      objectPrefix: "hls/asset-1/a1",
    });
  });

  it("keeps legacy stream assets bound to the original bucket without migration", () => {
    expect(
      resolveAssetStorageBinding(
        {
          streamBucket: "bq-sqwad-streaming-media",
          storagePath: "hls/legacy/master.m3u8",
        },
        "stream",
        legacy,
      ),
    ).toEqual({
      primaryDestinationId: "lovable-stream-legacy",
      replicaIds: [],
      objectPrefix: null,
    });
  });

  it("resolves poster bindings and source prefixes through the same helper", () => {
    expect(
      resolveAssetStorageBinding(
        {
          posterDestinationId: "lov-poster-01",
          streamReplicaIds: ["lov-poster-replica"],
          posterObjectPrefix: "posters/asset-1",
        },
        "poster",
        legacy,
      ),
    ).toEqual({
      primaryDestinationId: "lov-poster-01",
      replicaIds: ["lov-poster-replica"],
      objectPrefix: "posters/asset-1",
    });
    expect(
      resolveAssetStorageBinding({ sourcePath: "uploads/asset-2/source.mp4" }, "source", legacy)
        .objectPrefix,
    ).toBe("uploads/asset-2/source.mp4");
  });
});

describe("conservative Backblaze free delivery budget", () => {
  it("uses the lower of three times monthly storage and the older 1 GB/day reading", () => {
    expect(calculateB2MonthlyFreeEgressBudget(1_000_000_000)).toBe(2_400_000_000);
    expect(calculateB2MonthlyFreeEgressBudget(20_000_000_000)).toBe(24_000_000_000);
    expect(calculateB2DailyFreeEgressBudget()).toBe(800_000_000);
  });
});
