import { describe, expect, it } from "vitest";
import { formatMinorCurrency } from "@/lib/format-money";

describe("formatMinorCurrency", () => {
  it.each(["NGN", "USD", "GBP", "GHS", "KES", "ZAR"])("formats %s from integer minor units", currency => {
    const value = formatMinorCurrency(12345, currency);
    expect(value).toMatch(/123[.,]45/);
    expect(value).not.toContain("NaN");
  });

  it("respects zero-decimal currencies such as JPY", () => {
    const value = formatMinorCurrency(12345, "JPY");
    expect(value).toContain("12,345");
    expect(value).not.toMatch(/[.,]\d{2}$/);
  });

  it("respects three-decimal currencies such as KWD", () => {
    const value = formatMinorCurrency(12345, "KWD");
    expect(value).toMatch(/12[.,]345/);
  });

  it("preserves the sign for negative amounts smaller than one major unit", () => {
    const value = formatMinorCurrency(-1, "USD");
    expect(value).toContain("-");
    expect(value).toMatch(/0[.,]01/);
  });

  it("rejects non-integer amounts rather than rounding floating-point input", () => {
    expect(formatMinorCurrency(1.25, "USD")).toBe("—");
  });
});
