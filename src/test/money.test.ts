import { describe, expect, it } from "vitest";
import {
  accrueMicroKobo,
  cumulativeCostKobo,
  incrementalCostKobo,
  requireKoboAmount,
  settleMicroKoboToKobo,
} from "@/lib/server/money";

describe("exact PAYG money arithmetic", () => {
  it("calculates per-minute prices using cumulative playback seconds", () => {
    expect(cumulativeCostKobo(200, 600)).toBe(2_000);
    expect(cumulativeCostKobo(200, 1_500)).toBe(5_000);
    expect(cumulativeCostKobo(200, 3_600)).toBe(12_000);
  });

  it("uses half-up rounding only on the cumulative session total", () => {
    expect(cumulativeCostKobo(1, 30)).toBe(1);
    expect(cumulativeCostKobo(1, 29)).toBe(0);
    expect(cumulativeCostKobo(1, 90)).toBe(2);
  });

  it("makes incremental charges telescope to the same final total regardless of heartbeat boundaries", () => {
    const rate = 7;
    const checkpoints = [0, 7, 15, 32, 60, 61, 119, 120];
    const debits = checkpoints.slice(1).map((seconds, index) =>
      incrementalCostKobo(rate, checkpoints[index]!, seconds),
    );
    expect(debits.reduce((sum, value) => sum + value, 0)).toBe(cumulativeCostKobo(rate, 120));
  });

  it("retains exact sub-kobo accrual as integer micro-kobo plus remainder", () => {
    const accrued = accrueMicroKobo(1, 1);
    expect(accrued).toEqual({ microKobo: "16666", remainderOver60: "40" });
    expect(settleMicroKoboToKobo("500000")).toBe(1);
    expect(settleMicroKoboToKobo("499999")).toBe(0);
  });

  it("rejects invalid values and unsafe amounts", () => {
    expect(() => cumulativeCostKobo(-1, 1)).toThrow();
    expect(() => cumulativeCostKobo(1, -1)).toThrow();
    expect(() => incrementalCostKobo(1, 10, 9)).toThrow();
    expect(() => settleMicroKoboToKobo("-1")).toThrow();
    expect(() => requireKoboAmount(1.5)).toThrow();
    expect(() => requireKoboAmount(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});
