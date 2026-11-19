import { describe, expect, it } from "vitest";
import {
  currencyForCountry,
  minorUnitDigits,
  normalizeCountryCode,
  isSupportedPaystackCurrency,
} from "@/lib/server/currency";

describe("country currency policy", () => {
  it("uses a known country's local currency", () => {
    expect(currencyForCountry("NG")).toBe("NGN");
    expect(currencyForCountry("gb")).toBe("GBP");
    expect(currencyForCountry("JP")).toBe("JPY");
    expect(currencyForCountry("DE")).toBe("EUR");
  });

  it("defaults to USD when country is missing or unsupported", () => {
    expect(currencyForCountry(null)).toBe("USD");
    expect(currencyForCountry("")).toBe("USD");
    expect(currencyForCountry("ZZ")).toBe("USD");
  });

  it("normalizes only valid two-letter country codes", () => {
    expect(normalizeCountryCode(" ng ")).toBe("NG");
    expect(normalizeCountryCode("NGA")).toBeNull();
  });

  it("uses the ISO currency's minor-unit precision", () => {
    expect(minorUnitDigits("USD")).toBe(2);
    expect(minorUnitDigits("NGN")).toBe(2);
    expect(minorUnitDigits("JPY")).toBe(0);
    expect(minorUnitDigits("KWD")).toBe(3);
  });

  it("only enables Paystack for currencies explicitly supported by its integration", () => {
    expect(isSupportedPaystackCurrency("NGN")).toBe(true);
    expect(isSupportedPaystackCurrency("USD")).toBe(true);
    expect(isSupportedPaystackCurrency("GBP")).toBe(false);
  });
});
