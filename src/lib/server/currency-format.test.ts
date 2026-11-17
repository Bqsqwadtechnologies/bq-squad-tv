import { describe, expect, it } from "vitest";
import { currencySymbol, formatMinorCurrency } from "./currency-format";

describe("minor-unit currency formatting", () => {
  it("formats two-decimal currencies without floating point", () => {
    expect(formatMinorCurrency(123456, "NGN")).toContain("1,234.56");
  });
  it("formats zero-decimal currencies", () => {
    expect(formatMinorCurrency(1234, "JPY")).toContain("1,234");
    expect(formatMinorCurrency(1234, "JPY")).not.toContain(".");
  });
  it("formats three-decimal currencies", () => {
    expect(formatMinorCurrency(1234, "KWD")).toContain("1.234");
  });
  it("preserves a negative amount smaller than one major unit", () => {
    expect(formatMinorCurrency(-5, "USD")).toContain("-$0.05");
  });
  it("returns the currency's narrow symbol", () => {
    expect(currencySymbol("NGN").length).toBeGreaterThan(0);
  });
});
