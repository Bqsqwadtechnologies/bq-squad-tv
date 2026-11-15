import { describe, expect, it } from "vitest";
import { getPaystackTopup } from "@/lib/server/paystack";
import { getGooglePlayProducts } from "@/lib/server/google-play";

describe("website and Android payment product configuration", () => {
  it("accepts only configured integer-kobo Paystack top-ups", () => {
    const config = {
      walletTopups: {
        starter: { amountMinor: 50000, creditMinor: 50000 },
        invalid: { amountMinor: 1.5, creditMinor: 10 },
      },
    };
    expect(getPaystackTopup(config, "starter")).toEqual({ amountMinor: 50000, creditMinor: 50000 });
    expect(() => getPaystackTopup(config, "missing")).toThrow();
    expect(() => getPaystackTopup(config, "invalid")).toThrow();
  });

  it("exposes only active, well-formed Google Play consumables", () => {
    const products = getGooglePlayProducts({
      googlePlayProducts: [
        { productId: "wallet_100", title: "Wallet 100", credits: 100, creditMinor: 10000, active: true },
        { productId: "disabled", title: "Disabled", credits: 10, creditMinor: 1000, active: false },
        { productId: "bad_amount", title: "Bad", credits: 10, creditMinor: 10.5, active: true },
      ],
    });
    expect(products).toEqual([{
      productId: "wallet_100", title: "Wallet 100", description: "", credits: 100, creditMinor: 10000, active: true,
    }]);
  });

  it("returns no Play products when pricing is not configured", () => {
    expect(getGooglePlayProducts({})).toEqual([]);
  });
});
