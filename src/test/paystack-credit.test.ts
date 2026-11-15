import { describe, expect, it } from "vitest";
import { ApiError, type Firestore } from "@/lib/server/firebase-admin";
import { creditPaystackPayment, getPaystackTopup } from "@/lib/server/paystack";

function fakeFirestore(
  documents: Record<string, Record<string, unknown> | null>,
  capture: { writes: unknown[] },
): Firestore {
  return {
    docName: (path: string) => path,
    transact: async (paths: string[], callback: (docs: Array<Record<string, unknown> | null>) => unknown) => {
      const docs = paths.map(path => documents[path] ?? null);
      const outcome = await callback(docs) as { result: unknown; writes: unknown[] };
      capture.writes = outcome.writes;
      return outcome.result;
    },
  } as unknown as Firestore;
}

describe("Paystack wallet credit validation", () => {
  const input = {
    reference: "BQTV_1234567890abcdef",
    uid: "viewer-1",
    amountMinor: 50000,
    creditMinor: 50000,
    email: "viewer@example.com",
  };

  it("refuses to credit without an original payment record", async () => {
    const capture = { writes: [] as unknown[] };
    const fs = fakeFirestore({}, capture);
    await expect(creditPaystackPayment(fs, input)).rejects.toMatchObject({
      code: "PAYMENT_NOT_FOUND",
    });
  });

  it("rejects a payment record belonging to another user", async () => {
    const capture = { writes: [] as unknown[] };
    const fs = fakeFirestore({
      ["payments/paystack_" + input.reference]: {
        uid: "someone-else",
        reference: input.reference,
        provider: "paystack",
        amountMinor: input.amountMinor,
        creditMinor: input.creditMinor,
        status: "pending",
      },
    }, capture);
    await expect(creditPaystackPayment(fs, input)).rejects.toBeInstanceOf(ApiError);
  });

  it("credits only the amount recorded for a pending payment", async () => {
    const capture = { writes: [] as unknown[] };
    const fs = fakeFirestore({
      ["payments/paystack_" + input.reference]: {
        uid: input.uid,
        reference: input.reference,
        provider: "paystack",
        amountMinor: input.amountMinor,
        creditMinor: input.creditMinor,
        status: "pending",
      },
    }, capture);
    const result = await creditPaystackPayment(fs, input);
    expect(result).toEqual({ credited: true, balanceMinor: input.creditMinor });
    expect(capture.writes).toHaveLength(3);
  });

  it("does not allow a USD payment to credit an NGN wallet", async () => {
    const capture = { writes: [] as unknown[] };
    const fs = fakeFirestore({
      ["payments/paystack_" + input.reference]: {
        uid: input.uid, reference: input.reference, provider: "paystack",
        amountMinor: input.amountMinor, creditMinor: input.creditMinor,
        currency: "USD", status: "pending",
      },
      ["wallets/" + input.uid]: { balanceMinor: 1000, currency: "NGN" },
    }, capture);
    await expect(creditPaystackPayment(fs, { ...input, currency: "USD" })).rejects.toMatchObject({
      code: "WALLET_CURRENCY_MISMATCH",
    });
    expect(capture.writes).toHaveLength(0);
  });

  it("does not reuse NGN kobo top-up prices for USD accounts", () => {
    const config = { walletTopups: { starter: { amountMinor: 50000, creditMinor: 50000 } } };
    expect(() => getPaystackTopup(config, "starter", "USD")).toThrow(
      expect.objectContaining({ code: "TOPUP_UNAVAILABLE" }),
    );
  });

  it("uses the currency-specific configured top-up price", () => {
    const config = {
      walletTopups: { starter: { amountMinor: 50000, creditMinor: 50000 } },
      walletTopupsByCurrency: {
        USD: { starter: { amountMinor: 499, creditMinor: 499 } },
      },
    };
    expect(getPaystackTopup(config, "starter", "USD")).toEqual({ amountMinor: 499, creditMinor: 499 });
  });

  it("does not credit an already credited payment again", async () => {
    const capture = { writes: [] as unknown[] };
    const fs = fakeFirestore({
      ["payments/paystack_" + input.reference]: {
        uid: input.uid,
        reference: input.reference,
        provider: "paystack",
        amountMinor: input.amountMinor,
        creditMinor: input.creditMinor,
        status: "credited",
      },
    }, capture);
    const result = await creditPaystackPayment(fs, input);
    expect(result.credited).toBe(false);
    expect(capture.writes).toHaveLength(0);
  });
});
