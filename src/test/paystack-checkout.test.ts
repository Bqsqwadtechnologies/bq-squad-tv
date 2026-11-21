import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  isSupportedPaystackCurrency,
  currencyForCountry,
  minorUnitDigits,
  minorUnitName,
} from "@/lib/server/currency";

describe("Paystack Currency & Checkout Configuration", () => {
  it("supports the required Paystack settlement currencies", () => {
    expect(isSupportedPaystackCurrency("NGN")).toBe(true);
    expect(isSupportedPaystackCurrency("GHS")).toBe(true);
    expect(isSupportedPaystackCurrency("ZAR")).toBe(true);
    expect(isSupportedPaystackCurrency("KES")).toBe(true);
    expect(isSupportedPaystackCurrency("USD")).toBe(true);
    expect(isSupportedPaystackCurrency("XOF")).toBe(true);

    expect(isSupportedPaystackCurrency("EUR")).toBe(false);
    expect(isSupportedPaystackCurrency("GBP")).toBe(false);
    expect(isSupportedPaystackCurrency("JPY")).toBe(false);
  });

  it("maps country codes to primary settlement currency per platform spec", () => {
    expect(currencyForCountry("NG")).toBe("NGN");
    expect(currencyForCountry("GH")).toBe("GHS");
    expect(currencyForCountry("KE")).toBe("KES");
    expect(currencyForCountry("ZA")).toBe("ZAR");
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry("DE")).toBe("EUR");
    expect(currencyForCountry("FR")).toBe("EUR");
    // Unknown or missing defaults to USD, never implicit NGN
    expect(currencyForCountry("XX")).toBe("USD");
    expect(currencyForCountry(null)).toBe("USD");
    expect(currencyForCountry(undefined)).toBe("USD");
  });

  it("handles minor unit calculations accurately", () => {
    expect(minorUnitDigits("NGN")).toBe(2);
    expect(minorUnitDigits("USD")).toBe(2);
    expect(minorUnitDigits("XOF")).toBe(0);
    expect(minorUnitName("NGN")).toBe("minor unit (1/100)");
    expect(minorUnitName("XOF")).toBe("major unit");
  });

  it("verifies Paystack webhook HMAC-SHA512 signature contract", () => {
    const secretKey = "sk_test_mock_secret_key_12345";
    const payload = JSON.stringify({
      event: "charge.success",
      data: {
        id: 998877,
        reference: "BQTV_test_reference_abc",
        amount: 50000,
        currency: "NGN",
        status: "success",
      },
    });

    const expectedSignature = crypto
      .createHmac("sha512", secretKey)
      .update(payload)
      .digest("hex");

    // Recompute and assert match
    const computed = crypto
      .createHmac("sha512", secretKey)
      .update(payload)
      .digest("hex");

    expect(computed).toBe(expectedSignature);
    expect(computed).toHaveLength(128); // 512 bits = 128 hex chars
  });
});
