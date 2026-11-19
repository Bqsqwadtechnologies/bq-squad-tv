import { describe, expect, it } from "vitest";
import {
  monthlyBudgetStatus,
  requestDailyLimitChange,
  shouldSendBudgetAlert,
} from "@/lib/server/wallet-limits";

describe("viewer spending controls", () => {
  it("applies lower daily limits immediately", () => {
    expect(requestDailyLimitChange({ currentLimitMinor: 5000, requestedLimitMinor: 2000 })).toEqual(
      { dailyLimitMinor: 2000, pendingDailyLimitMinor: null, pendingEffectiveAt: null },
    );
  });
  it("delays higher daily limits", () => {
    expect(
      requestDailyLimitChange({ currentLimitMinor: 2000, requestedLimitMinor: 5000, nowMs: 0 }),
    ).toEqual({
      dailyLimitMinor: 2000,
      pendingDailyLimitMinor: 5000,
      pendingEffectiveAt: "1970-01-02T00:00:00.000Z",
    });
  });
  it("reports monthly budget remaining without negative values", () => {
    expect(monthlyBudgetStatus({ budgetMinor: 1000, spentMinor: 350, currency: "NGN" })).toEqual({
      enabled: true,
      remainingMinor: 650,
      crossed: false,
    });
    expect(monthlyBudgetStatus({ budgetMinor: 1000, spentMinor: 1200, currency: "JPY" })).toEqual({
      enabled: true,
      remainingMinor: 0,
      crossed: true,
    });
  });
  it("deduplicates budget threshold alerts", () => {
    expect(shouldSendBudgetAlert({ crossed: true, alreadyAlertedForPeriod: false })).toBe(true);
    expect(shouldSendBudgetAlert({ crossed: true, alreadyAlertedForPeriod: true })).toBe(false);
  });
});
