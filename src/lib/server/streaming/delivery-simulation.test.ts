import { describe, expect, it } from "vitest";
import { runDeliverySimulation } from "./delivery-simulation";

describe("delivery simulation", () => {
  it("simulates 1000 viewers without a database read per media segment", () => {
    const result = runDeliverySimulation({
      viewers: 1_000,
      durationSeconds: 600,
      segmentsPerMinute: 15,
    });
    expect(result.viewers).toBe(1_000);
    expect(result.segmentRequests).toBe(150_000);
    expect(result.segmentApiReads).toBe(0);
    expect(result.playlistGenerations).toBe(1);
    expect(result.settlementTransactions).toBe(2_000);
  });

  it("bounds playlist signing and includes replica failover work", () => {
    const result = runDeliverySimulation({
      viewers: 1_000,
      durationSeconds: 3_600,
      failoverEvery: 100,
    });
    expect(result.playlistGenerations).toBe(2);
    expect(result.storageSigningCalls).toBe(6);
    expect(result.failovers).toBe(10);
    expect(result.outboundStorageCalls).toBe(16);
  });
});
