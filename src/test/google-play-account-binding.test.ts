import { describe, expect, it } from "vitest";
import { getGooglePlayProducts, googlePlayAccountId } from "@/lib/server/google-play";

describe("Google Play purchase account binding", () => {
  it("uses a stable 64-character SHA-256 account identifier", async () => {
    const first = await googlePlayAccountId("firebase-user-123");
    const second = await googlePlayAccountId("firebase-user-123");
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not reuse the same account identifier for different Firebase users", async () => {
    const first = await googlePlayAccountId("firebase-user-123");
    const second = await googlePlayAccountId("firebase-user-456");
    expect(first).not.toBe(second);
  });
});


describe("Google Play localized wallet products", () => {
  const config = {
    googlePlayProducts: [{
      active: true, productId: "wallet.starter", title: "Starter", credits: 50,
      creditMinor: 5000,
      creditMinorByCurrency: { USD: 499, NGN: 50000, JPY: 500 },
    }],
  };

  it("returns the configured wallet value in the user's currency", () => {
    expect(getGooglePlayProducts(config, "USD")[0]).toMatchObject({ creditMinor: 499, currency: "USD" });
    expect(getGooglePlayProducts(config, "NGN")[0]).toMatchObject({ creditMinor: 50000, currency: "NGN" });
    expect(getGooglePlayProducts(config, "JPY")[0]).toMatchObject({ creditMinor: 500, currency: "JPY" });
  });

  it("does not reuse a legacy NGN value for USD accounts", () => {
    const legacy = { googlePlayProducts: [{ active: true, productId: "wallet.old", title: "Old", credits: 5, creditMinor: 500 }] };
    expect(getGooglePlayProducts(legacy, "USD")).toEqual([]);
    expect(getGooglePlayProducts(legacy, "NGN")).toHaveLength(1);
  });
});
