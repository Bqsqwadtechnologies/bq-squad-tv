import { describe, expect, it } from "vitest";
import {
  classifyPaymentReconciliation,
  paymentReviewKey,
} from "@/lib/server/payment-reconciliation";

const local = {
  reference: "BQTV_12345678",
  amountMinor: 5000,
  currency: "NGN",
  status: "credited",
};

describe("payment reconciliation classification", () => {
  it("matches identical provider facts", () => {
    expect(classifyPaymentReconciliation(local, { ...local })).toBe("matched");
  });
  it("flags each mismatch without changing the ledger", () => {
    expect(classifyPaymentReconciliation(local, null)).toBe("provider_record_missing");
    expect(classifyPaymentReconciliation(null, local)).toBe("local_record_missing");
    expect(classifyPaymentReconciliation(local, { ...local, amountMinor: 4000 })).toBe(
      "amount_mismatch",
    );
    expect(classifyPaymentReconciliation(local, { ...local, currency: "USD" })).toBe(
      "currency_mismatch",
    );
    expect(classifyPaymentReconciliation(local, { ...local, status: "reversed" })).toBe(
      "status_mismatch",
    );
  });
  it("rejects invalid amounts and mismatched references", () => {
    expect(() => classifyPaymentReconciliation({ ...local, amountMinor: 1.5 }, local)).toThrow();
    expect(() =>
      classifyPaymentReconciliation(local, { ...local, reference: "BQTV_87654321" }),
    ).toThrow();
  });
  it("creates a deterministic, provider-scoped review key", async () => {
    const first = await paymentReviewKey("paystack", local.reference);
    expect(await paymentReviewKey("paystack", local.reference)).toBe(first);
    expect(await paymentReviewKey("google_play", local.reference)).not.toBe(first);
    await expect(paymentReviewKey("unknown", local.reference)).rejects.toThrow();
  });
});
