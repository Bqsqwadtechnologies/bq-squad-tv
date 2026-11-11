import { describe, expect, it } from "vitest";
import {
  costForCumulativeSeconds,
  elapsedSeconds,
  incrementalSessionCharge,
  maxAffordableSeconds,
  producerShareMinor,
  requireSessionOwned,
  safeAddMinor,
  toSessionSnapshot,
} from "@/routes/api/public/v1/sessions/-shared";

describe("session metering", () => {
  it("caps elapsed server time to 300 seconds and rejects negative elapsed time", () => {
    const now = new Date("2026-11-11T00:05:00.000Z");
    expect(elapsedSeconds("2026-11-11T00:00:00.000Z", now)).toBe(300);
    expect(elapsedSeconds("2026-11-11T00:00:01.000Z", new Date("2026-11-11T00:00:00.000Z"))).toBe(0);
    expect(elapsedSeconds("not-a-date", now)).toBe(0);
  });

  it("uses the canonical half-up rule on the cumulative session total", () => {
    expect(costForCumulativeSeconds(1, 100)).toBe(2);
    expect(costForCumulativeSeconds(60, 100)).toBe(100);
    expect(costForCumulativeSeconds(61, 100)).toBe(102);
    expect(costForCumulativeSeconds(29, 1)).toBe(0);
    expect(costForCumulativeSeconds(30, 1)).toBe(1);
    expect(costForCumulativeSeconds(90, 1)).toBe(2);
  });

  it("charges only the difference since the previous heartbeat", () => {
    const first = incrementalSessionCharge(0, 15, 100);
    const second = incrementalSessionCharge(first.billedSeconds, 15, 100);
    const third = incrementalSessionCharge(second.billedSeconds, 30, 100);
    expect(first).toEqual({ billedSeconds: 15, chargeMinor: 25, sessionTotalMinor: 25 });
    expect(second).toEqual({ billedSeconds: 30, chargeMinor: 25, sessionTotalMinor: 50 });
    expect(third).toEqual({ billedSeconds: 60, chargeMinor: 50, sessionTotalMinor: 100 });
    expect(first.chargeMinor + second.chargeMinor + third.chargeMinor).toBe(100);
  });

  it("never bills beyond the available wallet or daily limit", () => {
    expect(maxAffordableSeconds(0, 60, 100, 25)).toBe(15);
    expect(maxAffordableSeconds(15, 30, 100, 10)).toBe(6);
    expect(maxAffordableSeconds(0, 60, 100, 0)).toBe(0);
  });

  it("allocates producer shares with integer basis-point arithmetic", () => {
    expect(producerShareMinor(101, 7000)).toBe(70);
    expect(producerShareMinor(99, 3333)).toBe(32);
  });

  it("rejects invalid amounts and elapsed windows", () => {
    expect(() => costForCumulativeSeconds(-1, 100)).toThrow();
    expect(() => costForCumulativeSeconds(61, Number.MAX_SAFE_INTEGER)).toThrow();
    expect(() => incrementalSessionCharge(0, 301, 100)).toThrow();
    expect(() => safeAddMinor(Number.MAX_SAFE_INTEGER, 1)).toThrow();
  });

  it("enforces session ownership", () => {
    expect(() => requireSessionOwned(null, "s1", "u1")).toThrowError(/does not exist/);
    expect(() => requireSessionOwned({ uid: "u2" }, "s1", "u1")).toThrowError(/another account/);
    expect(requireSessionOwned({ uid: "u1", active: true }, "s1", "u1")["active"]).toBe(true);
  });

  it("returns the stored cumulative settlement in the snapshot", () => {
    expect(toSessionSnapshot("s1", {
      ratePerMinuteMinor: 100, billedSeconds: 30, sessionTotalMinor: 50, active: true,
    }, 500, "https://media.example/signed.m3u8")).toMatchObject({
      sessionId: "s1", billedSeconds: 30, sessionTotalMinor: 50, walletBalanceMinor: 500, active: true,
    });
  });
});
