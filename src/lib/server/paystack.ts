import { ApiError, type Firestore, encodeFields } from "./firebase-admin";
import { isSupportedPaystackCurrency, minorUnitDigits, requireCurrency } from "./currency";
import { DEFAULT_EXCHANGE_RATES } from "./pricing";

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


/** Load a daily USD reference-rate table only when the wallet currency is not
 * present in the configured/default table. Owner-configured rates take priority. */
let liveUsdRates: Record<string, number> | null = null;
let liveUsdRatesExpiresAt = 0;

export async function withPaystackExchangeRates(
  config: Record<string, unknown>,
  walletCurrencyRaw: string,
): Promise<Record<string, unknown>> {
  const walletCurrency = requireCurrency(walletCurrencyRaw);
  const configured = config["exchangeRates"];
  const configuredRates = configured && typeof configured === "object" && !Array.isArray(configured)
    ? configured as Record<string, number>
    : {};
  const knownRates = { ...DEFAULT_EXCHANGE_RATES, ...configuredRates };
  if (typeof knownRates[walletCurrency] === "number" &&
      Number.isFinite(knownRates[walletCurrency]) && knownRates[walletCurrency] > 0) {
    return config;
  }

  const now = Date.now();
  if (!liveUsdRates || liveUsdRatesExpiresAt <= now) {
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD", {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(4500),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Exchange-rate service unavailable");
      const payload = await response.json() as {
        result?: string;
        base_code?: string;
        time_next_update_unix?: number;
        rates?: Record<string, unknown>;
      };
      if (payload.result !== "success" || payload.base_code !== "USD" ||
          !payload.rates || typeof payload.rates !== "object") {
        throw new Error("Exchange-rate response invalid");
      }
      const rates: Record<string, number> = {};
      for (const [code, raw] of Object.entries(payload.rates)) {
        if (/^[A-Z]{3}$/.test(code) && typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
          rates[code] = raw;
        }
      }
      if (!rates.USD || !rates[walletCurrency]) throw new Error("Currency rate unavailable");
      liveUsdRates = rates;
      const nextUpdate = typeof payload.time_next_update_unix === "number"
        ? payload.time_next_update_unix * 1000
        : now + 6 * 60 * 60 * 1000;
      liveUsdRatesExpiresAt = Math.max(now + 60 * 60 * 1000, Math.min(nextUpdate, now + 26 * 60 * 60 * 1000));
    } catch {
      if (typeof configuredRates[walletCurrency] === "number" &&
          Number.isFinite(configuredRates[walletCurrency]) && configuredRates[walletCurrency] > 0) {
        return config;
      }
      throw new ApiError(400, "TOPUP_CURRENCY_NOT_CONFIGURED",
        "A reliable exchange rate is not available for this wallet currency right now. Please try again later or fund your wallet in the BQ SQWAD TV app.");
    }
  }

  return { ...config, exchangeRates: { ...liveUsdRates, ...configuredRates } };
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
    walletCurrency?: string;
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
  const walletCurrency = requireCurrency(input.walletCurrency ?? currency);
  if (!isSupportedPaystackCurrency(currency))
    throw new ApiError(
      400,
      "PAYMENT_CURRENCY_UNSUPPORTED",
      "Paystack cannot process this wallet currency for this account. Please use the BQ SQWAD TV app to top up your wallet.",
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
        (payment["currency"] ?? "NGN") !== currency ||
        (payment["walletCurrency"] ?? payment["currency"] ?? "NGN") !== walletCurrency
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
      const actualWalletCurrency =
        typeof wallet["currency"] === "string" ? (wallet["currency"] as string) : walletCurrency;
      if (actualWalletCurrency !== walletCurrency)
        throw new ApiError(409, "WALLET_CURRENCY_MISMATCH", "Your wallet currency changed after this payment was started.");
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
              fields: encodeFields({ balanceMinor: nextBalance, currency: walletCurrency, updatedAt: now }),
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
                walletCurrency,
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
                "walletCurrency",
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
                currency: walletCurrency,
                providerCurrency: currency,
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

function convertedDefaultTopup(
  config: Record<string, unknown>,
  packageId: string,
  currency: string,
): { amountMinor: number; creditMinor: number } | null {
  const base = DEFAULT_NGN_TOPUPS[packageId];
  if (!base || !isSupportedPaystackCurrency(currency)) return null;
  const configuredRates = config["exchangeRates"];
  const rates = {
    ...DEFAULT_EXCHANGE_RATES,
    ...(configuredRates && typeof configuredRates === "object" && !Array.isArray(configuredRates)
      ? configuredRates as Record<string, number>
      : {}),
  };
  const ngnRate = rates["NGN"];
  const targetRate = rates[currency];
  if (
    typeof ngnRate !== "number" || !Number.isFinite(ngnRate) || ngnRate <= 0 ||
    typeof targetRate !== "number" || !Number.isFinite(targetRate) || targetRate <= 0
  ) return null;

  // Convert the NGN package's major-unit value through the configured
  // USD-based exchange table, then round to the target currency's ISO minor unit.
  const ngnMajor = base.amountMinor / 100;
  const targetMajor = (ngnMajor / ngnRate) * targetRate;
  const digits = minorUnitDigits(currency);
  const creditMinor = Math.max(1, Math.round(targetMajor * (10 ** digits)));
  return {
    // Paystack's XOF API amount is expressed in hundredths although the
    // wallet's XOF ledger uses whole units.
    amountMinor: currency === "XOF" ? creditMinor * 100 : creditMinor,
    creditMinor,
  };
}

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
    const minimums = config["walletTopupMinimumMinorByCurrency"];
    const configuredMinimum =
      minimums && typeof minimums === "object" && !Array.isArray(minimums)
        ? (minimums as Record<string, unknown>)[currency]
        : null;
    // ₦200 is a legacy NGN-only minimum. Never apply naira minor units to
    // another currency; non-NGN currencies require an explicit configured minimum.
    const PAYSTACK_CUSTOM_MINIMUM_MINOR: Readonly<Record<string, number>> = {
      NGN: 20000, // BQ SQWAD TV minimum: ₦200 (above Paystack's ₦50 floor)
      USD: 200,
      GHS: 10,
      ZAR: 100,
      KES: 300,
      XOF: 1,
    };
    const minimumMinor =
      typeof configuredMinimum === "number" &&
      Number.isSafeInteger(configuredMinimum) &&
      configuredMinimum > 0
        ? configuredMinimum
        : PAYSTACK_CUSTOM_MINIMUM_MINOR[currency] ?? null;
    if (minimumMinor === null) {
      throw new ApiError(
        400,
        "TOPUP_CURRENCY_NOT_CONFIGURED",
        "Paystack cannot process this wallet currency for this account. Please use the BQ SQWAD TV app to top up your wallet.",
      );
    }
    if (
      typeof customAmountMinor !== "number" ||
      !Number.isSafeInteger(customAmountMinor) ||
      customAmountMinor < minimumMinor
    ) {
      throw new ApiError(
        400,
        "TOPUP_MINIMUM_REQUIRED",
        "Enter an amount at or above the minimum for your wallet currency.",
      );
    }
    return {
      // Paystack requires XOF amounts in hundredths even though the wallet
      // ledger stores XOF as whole units.
      amountMinor: currency === "XOF" ? customAmountMinor * 100 : customAmountMinor,
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
  if (!offer || typeof offer !== "object") {
    offer = currency === "NGN"
      ? DEFAULT_NGN_TOPUPS[packageId]
      : convertedDefaultTopup(config, packageId, currency);
  }
  if (!offer || typeof offer !== "object")
    throw new ApiError(400, "TOPUP_UNAVAILABLE", "Paystack cannot process this wallet currency for this account. Please use the BQ SQWAD TV app to top up your wallet.");
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


/**
 * Resolve a Paystack checkout in a supported provider currency while keeping
 * the wallet credit denominated in the viewer's own currency.
 */
export function getPaystackCheckoutTopup(
  config: Record<string, unknown>,
  packageId: string,
  walletCurrencyRaw: string,
  customAmountMinor?: number,
): {
  amountMinor: number;
  displayAmountMinor: number;
  creditMinor: number;
  currency: string;
  walletCurrency: string;
  converted: boolean;
  exchangeRate: number;
} {
  const walletCurrency = requireCurrency(walletCurrencyRaw);
  if (isSupportedPaystackCurrency(walletCurrency)) {
    const offer = getPaystackTopup(config, packageId, walletCurrency, customAmountMinor);
    return {
      ...offer,
      currency: walletCurrency,
      walletCurrency,
      converted: false,
      exchangeRate: 1,
    };
  }

  const configuredRates = config["exchangeRates"];
  const rates: Record<string, number> = {
    ...DEFAULT_EXCHANGE_RATES,
    ...(configuredRates && typeof configuredRates === "object" && !Array.isArray(configuredRates)
      ? configuredRates as Record<string, number>
      : {}),
  };
  const localRate = rates[walletCurrency];
  const ngnRate = rates["NGN"];
  if (typeof localRate !== "number" || !Number.isFinite(localRate) || localRate <= 0 ||
      typeof ngnRate !== "number" || !Number.isFinite(ngnRate) || ngnRate <= 0) {
    throw new ApiError(400, "TOPUP_CURRENCY_NOT_CONFIGURED",
      "Paystack cannot process this wallet currency on the website. Please download the BQ SQWAD TV app and top up there.");
  }

  let localCreditMinor: number;
  if (packageId === "custom") {
    if (typeof customAmountMinor !== "number" || !Number.isSafeInteger(customAmountMinor) || customAmountMinor <= 0) {
      throw new ApiError(400, "TOPUP_AMOUNT_INVALID", "Enter a valid top-up amount.");
    }
    localCreditMinor = customAmountMinor;
  } else {
    const byCurrency = config["walletTopupsByCurrency"];
    const currencyOffers = byCurrency && typeof byCurrency === "object" && !Array.isArray(byCurrency)
      ? (byCurrency as Record<string, unknown>)[walletCurrency] : null;
    const configured = currencyOffers && typeof currencyOffers === "object" && !Array.isArray(currencyOffers)
      ? (currencyOffers as Record<string, unknown>)[packageId] : null;
    if (configured && typeof configured === "object") {
      const row = configured as Record<string, unknown>;
      const amount = row["creditMinor"] ?? row["amountMinor"];
      if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 1) {
        throw new ApiError(503, "TOPUP_CONFIG_INVALID", "The wallet top-up configuration is invalid.");
      }
      localCreditMinor = amount;
    } else {
      const base = DEFAULT_NGN_TOPUPS[packageId];
      if (!base) throw new ApiError(400, "TOPUP_UNAVAILABLE", "This top-up package is unavailable.");
      const localMajor = (base.creditMinor / 100 / ngnRate) * localRate;
      localCreditMinor = Math.max(1, Math.round(localMajor * (10 ** minorUnitDigits(walletCurrency))));
    }
  }

  const localMajor = localCreditMinor / (10 ** minorUnitDigits(walletCurrency));
  const usdMajor = localMajor / localRate;
  const amountMinor = Math.max(1, Math.round(usdMajor * 100));
  return {
    amountMinor,
    displayAmountMinor: localCreditMinor,
    creditMinor: localCreditMinor,
    currency: "USD",
    walletCurrency,
    converted: true,
    exchangeRate: localRate,
  };
}
