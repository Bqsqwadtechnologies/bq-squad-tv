import { describe, it, expect } from "vitest";
import {
  cumulativeCost,
  incrementalCost,
  creditAcceptedSeconds,
  calculateBlockBoundary,
  calculateHoldSize,
  calculateRevenueSplit,
  projectLowBalance,
} from "../lib/server/billing-engine";

describe("Billing Engine Pure Suite", () => {
  it("calculates exact cumulative costs without drift (worked example 150s at 15000 gives 37500)", () => {
    // 15000 minor units/min, 150 seconds:
    // (15000 * 150 + 30) / 60 = 2250030 / 60 = 37500
    const cost = cumulativeCost(15000n, 150n);
    expect(cost).toBe(37500n);
  });

  it("calculates incremental debits matching cumulative totals", () => {
    const rate = 12000n; // 120.00 / min
    const step1 = incrementalCost(rate, 0n, 30n);
    const step2 = incrementalCost(rate, 30n, 60n);
    const step3 = incrementalCost(rate, 60n, 150n);
    const total = step1 + step2 + step3;
    expect(total).toBe(cumulativeCost(rate, 150n));
  });

  it("caps credited seconds at 1.5x expected heartbeat interval", () => {
    // 10s interval, player reports 20s delta
    const credited = creditAcceptedSeconds(20n, 10n, true);
    expect(credited).toBe(15n);

    // When paused, credits 0
    const paused = creditAcceptedSeconds(20n, 10n, false);
    expect(paused).toBe(0n);
  });

  it("detects 300-second block boundaries", () => {
    const b1 = calculateBlockBoundary(290n, 305n, 300n);
    expect(b1.isBlockBoundary).toBe(true);
    expect(b1.blockIndex).toBe(1n);

    const b2 = calculateBlockBoundary(305n, 315n, 300n);
    expect(b2.isBlockBoundary).toBe(false);
  });

  it("calculates revenue splits where partner share + platform remainder exactly equals gross", () => {
    const gross = 10_000_000n;
    const shareBps = 2500n; // 25%
    const split = calculateRevenueSplit(gross, shareBps);
    expect(split.shareMinor).toBe(2_500_000n);
    expect(split.platformMinor).toBe(7_500_000n);
    expect(split.shareMinor + split.platformMinor).toBe(gross);

    // Uneven gross with remainder
    const uneven = calculateRevenueSplit(1001n, 3333n);
    expect(uneven.shareMinor + uneven.platformMinor).toBe(1001n);
  });

  it("projects low balance when remaining time is under 2 minutes", () => {
    const rate = 6000n; // 60.00 / min -> 100 / sec
    // 100 seconds worth of balance
    const low = projectLowBalance(10000n, rate, 2n);
    expect(low.isLowBalance).toBe(true);

    // 300 seconds worth of balance
    const ok = projectLowBalance(30000n, rate, 2n);
    expect(ok.isLowBalance).toBe(false);
  });
});
