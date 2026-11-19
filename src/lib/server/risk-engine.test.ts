import { describe, expect, it } from "vitest";
import { scoreRiskSignals } from "./risk-engine";

describe("risk scoring", () => {
  it("scores normal activity below the elevated threshold", () => {
    expect(scoreRiskSignals({ signin: 2, session_start: 3 })).toEqual({
      score: 5,
      level: "normal",
    });
  });
  it("raises risk for rapid device changes and failed payments", () => {
    expect(scoreRiskSignals({ device_change: 8, failed_payment: 6 }).level).toBe("high");
  });
  it("caps the score and rejects malformed counts", () => {
    expect(scoreRiskSignals({ topup: 1000 }).score).toBe(100);
    expect(() => scoreRiskSignals({ signin: -1 })).toThrow();
  });
});
