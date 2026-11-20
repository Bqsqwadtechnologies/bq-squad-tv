import { ApiError, type Firestore, encodeFields } from "./firebase-admin";
import { isSupportedPaystackCurrency, requireCurrency } from "./currency";

function requiredSecret(): string {
  const secret = process.env["PAYSTACK_SECRET_KEY"];
  if (!secret)
    throw new ApiError(503, "PAYSTACK_NOT_CONFIGURED", "Website payments are not configured.");
  return secret;
}

export async function verifyPaystackSignature(
  rawBody: string,
  signature: string | null,
): Promise<void> {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) {
    throw new ApiError(
      401,
      "PAYSTACK_SIGNATURE_INVALID",
      "The payment notification signature is invalid.",
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredSecret()),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.match(/.{2}/g) ?? [], (part) =>
    Number.parseInt(part, 16),
  );
  const valid = await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(rawBody));
  if (!valid)
    throw new ApiError(
      401,
      "PAYSTACK_SIGNATURE_INVALID",
      "The payment notification signature is invalid.",
    );
}

export async function fetchPaystackVerification(
  reference: string,
): Promise<Record<string, unknown>> {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(reference))
    throw new ApiError(400, "PAYMENT_REFERENCE_INVALID", "The payment reference is invalid.");
  const response = await fetch(
    "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
    {
      headers: { authorization: "Bearer " + requiredSecret(), accept: "application/json" },
    },
  );
  const payload = (await response.json()) as {
    status?: boolean;
    message?: string;
    data?: Record<string, unknown>;
  };
  if (!response.ok || payload.status !== true || !payload.data) {
    throw new ApiError(
      502,
      "PAYSTACK_VERIFY_FAILED",
      "The payment provider could not verify this transaction.",
    );
  }
  if (payload.data["reference"] !== reference) {
    throw new ApiError(
      502,
      "PAYSTACK_REFERENCE_MISMATCH",
      "The payment provider returned a different transaction reference.",
    );
  }
  return payload.data;
}

/** Stable, non-sensitive Firestore key for Paystack webhook event replay protection. */
export async function paystackEventDocumentId(eventId: string | number): Promise<string> {
  const value = String(eventId);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(value)) {
    throw new ApiError(
      400,
      "PAYSTACK_EVENT_ID_INVALID",
      "The payment notification identifier is invalid.",
    );
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("paystack:" + value),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function creditPaystackPayment(
  fs: Firestore,
  input: {
    reference: string;
    uid: string;
    amountMinor: number;
    creditMinor: number;
    email: string | null;
    currency?: string;
  },
): Promise<{ credited: boolean; balanceMinor: number }> {
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor < 1 ||
    !Number.isSafeInteger(input.creditMinor) ||
    input.creditMinor < 1
  ) {
    throw new ApiError(400, "PAYMENT_AMOUNT_INVALID", "The verified payment amount is invalid.");
  }
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(input.reference))
    throw new ApiError(400, "PAYMENT_REFERENCE_INVALID", "The payment reference is invalid.");
  const currency = requireCurrency(input.currency ?? "NGN");
  if (!isSupportedPaystackCurrency(currency))
    throw new ApiError(
      400,
      "PAYMENT_CURRENCY_UNSUPPORTED",
      "Paystack does not support this wallet currency.",
    );
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.reference));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const paymentPath = "payments/paystack_" + input.reference;
  const walletPath = "wallets/" + input.uid;
  const ledgerPath = "ledger/paystack_" + hash;
  return fs.transact<{ credited: boolean; balanceMinor: number }>(
    [paymentPath, walletPath, ledgerPath],
    (docs) => {
      const payment = docs[0];
      const wallet = docs[1] ?? {};
      const ledger = docs[2];
      const currentBalance =
        typeof wallet["balanceMinor"] === "number" && Number.isSafeInteger(wallet["balanceMinor"])
          ? (wallet["balanceMinor"] as number)
          : 0;
      if (!payment) {
        throw new ApiError(404, "PAYMENT_NOT_FOUND", "The payment record could not be found.");
      }
      if (
        payment["uid"] !== input.uid ||
        payment["reference"] !== input.reference ||
        payment["provider"] !== "paystack" ||
        payment["amountMinor"] !== input.amountMinor ||
        payment["creditMinor"] !== input.creditMinor ||
        (payment["currency"] ?? "NGN") !== currency
      ) {
        throw new ApiError(
          409,
          "PAYMENT_RECORD_MISMATCH",
          "The verified transaction does not match its original payment record.",
        );
      }
      if (ledger) {
        if (ledger["uid"] !== input.uid || ledger["reference"] !== input.reference) {
          throw new ApiError(
            409,
            "PAYMENT_LEDGER_MISMATCH",
            "The payment ledger record does not match this account.",
          );
        }
        return { result: { credited: false, balanceMinor: currentBalance }, writes: [] };
      }
      if (payment["status"] === "credited") {
        return { result: { credited: false, balanceMinor: currentBalance }, writes: [] };
      }
      if (payment["status"] !== "pending" && payment["status"] !== "initializing") {
        throw new ApiError(
          409,
          "PAYMENT_NOT_CREDITABLE",
          "This payment is not in a creditable state.",
        );
      }
      const walletCurrency =
        typeof wallet["currency"] === "string" ? (wallet["currency"] as string) : currency;
      if (walletCurrency !== currency)
        throw new ApiError(
          409,
          "WALLET_CURRENCY_MISMATCH",
          "This payment currency does not match your wallet currency.",
        );
      const nextBalance = currentBalance + input.creditMinor;
      if (!Number.isSafeInteger(nextBalance))
        throw new ApiError(
          400,
          "WALLET_LIMIT_EXCEEDED",
          "The wallet balance exceeds the supported amount.",
        );
      const now = new Date().toISOString();
      return {
        result: { credited: true, balanceMinor: nextBalance },
        writes: [
          {
            update: {
              name: fs.docName(walletPath),
              fields: encodeFields({ balanceMinor: nextBalance, currency, updatedAt: now }),
            },
            updateMask: { fieldPaths: ["balanceMinor", "currency", "updatedAt"] },
          },
          {
            update: {
              name: fs.docName(paymentPath),
              fields: encodeFields({
                reference: input.reference,
                uid: input.uid,
                email: input.email,
                amountMinor: input.amountMinor,
                creditMinor: input.creditMinor,
                currency,
                provider: "paystack",
                status: "credited",
                creditedAt: now,
              }),
            },
            updateMask: {
              fieldPaths: [
                "reference",
                "uid",
                "email",
                "amountMinor",
                "creditMinor",
                "currency",
                "provider",
                "status",
                "creditedAt",
              ],
            },
          },
          {
            update: {
              name: fs.docName(ledgerPath),
              fields: encodeFields({
                uid: input.uid,
                kind: "wallet_topup",
                description: "Website wallet top-up",
                amountMinor: input.creditMinor,
                currency,
                reference: input.reference,
                provider: "paystack",
                createdAt: now,
              }),
            },
            currentDocument: { exists: false },
          },
        ],
      };
    },
  );
}

export const DEFAULT_NGN_TOPUPS: Record<
  string,
  { amountMinor: number; creditMinor: number; displayAmountMinor?: number }
> = {
  ngn_200: { amountMinor: 20000, creditMinor: 20000 },
  ngn_500: { amountMinor: 50000, creditMinor: 50000 },
  ngn_1000: { amountMinor: 100000, creditMinor: 100000 },
  ngn_1500: { amountMinor: 150000, creditMinor: 150000 },
  ngn_2000: { amountMinor: 200000, creditMinor: 200000 },
  ngn_2500: { amountMinor: 250000, creditMinor: 250000 },
  ngn_5000: { amountMinor: 500000, creditMinor: 500000 },
  ngn_10000: { amountMinor: 1000000, creditMinor: 1000000 },
  ngn_15000: { amountMinor: 1500000, creditMinor: 1500000 },
  ngn_20000: { amountMinor: 2000000, creditMinor: 2000000 },
  ngn_100000: { amountMinor: 10000000, creditMinor: 10000000 },
  ngn_200000: { amountMinor: 20000000, creditMinor: 20000000 },
};

export function getPaystackTopup(
  config: Record<string, unknown>,
  packageId: string,
  requestedCurrency = "NGN",
  customAmountMinor?: number,
): { amountMinor: number; displayAmountMinor: number; creditMinor: number } {
  const currency = requireCurrency(requestedCurrency);
  if (!isSupportedPaystackCurrency(currency))
    throw new ApiError(
      400,
      "PAYMENT_CURRENCY_UNSUPPORTED",
      "Paystack does not support this wallet currency.",
    );

  if (packageId === "custom") {
    if (
      typeof customAmountMinor !== "number" ||
      !Number.isSafeInteger(customAmountMinor) ||
      customAmountMinor < 20000
    ) {
      throw new ApiError(
        400,
        "TOPUP_MINIMUM_REQUIRED",
        "The minimum custom wallet top-up is ₦200.",
      );
    }
    return {
      amountMinor: customAmountMinor,
      displayAmountMinor: customAmountMinor,
      creditMinor: customAmountMinor,
    };
  }
  const byCurrency = config["walletTopupsByCurrency"];
  const currencyOffers =
    byCurrency && typeof byCurrency === "object" && !Array.isArray(byCurrency)
      ? (byCurrency as Record<string, unknown>)[currency]
      : null;
  // Legacy top-up amounts are denominated in NGN kobo and must never be reused
  // for USD or another country's currency.
  const offers =
    currencyOffers && typeof currencyOffers === "object" && !Array.isArray(currencyOffers)
      ? currencyOffers
      : currency === "NGN"
        ? config["walletTopups"]
        : null;
  let offer =
    offers && typeof offers === "object" ? (offers as Record<string, unknown>)[packageId] : null;
  if ((!offer || typeof offer !== "object") && currency === "NGN" && DEFAULT_NGN_TOPUPS[packageId]) {
    offer = DEFAULT_NGN_TOPUPS[packageId];
  }
  if (!offer || typeof offer !== "object")
    throw new ApiError(400, "TOPUP_UNAVAILABLE", "This wallet top-up is not available.");
  const row = offer as Record<string, unknown>;
  const amountMinor = row["amountMinor"];
  const creditMinor = row["creditMinor"] ?? amountMinor;
  if (
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 1 ||
    typeof creditMinor !== "number" ||
    !Number.isSafeInteger(creditMinor) ||
    creditMinor < 1
  ) {
    throw new ApiError(503, "TOPUP_CONFIG_INVALID", "The wallet top-up configuration is invalid.");
  }
  if (currency === "XOF" && amountMinor % 100 !== 0) {
    throw new ApiError(
      503,
      "TOPUP_CONFIG_INVALID",
      "XOF Paystack amounts must be configured as whole XOF units multiplied by 100.",
    );
  }
  return {
    amountMinor,
    displayAmountMinor: currency === "XOF" ? amountMinor / 100 : amountMinor,
    creditMinor,
  };
}
