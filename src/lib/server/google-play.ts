import { ApiError, type Firestore, encodeFields, toArrayBuffer } from "./firebase-admin";
import { requireCurrency } from "./currency";

type PlayServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function getPlayServiceAccount(): PlayServiceAccount {
  // Reuse the existing Firebase service account when a separate Play secret is not configured.
  // Google Play requires its own OAuth scope, so this module still mints an androidpublisher token.
  const raw =
    process.env["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"] || process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (!raw)
    throw new ApiError(
      503,
      "GOOGLE_PLAY_NOT_CONFIGURED",
      "Google Play purchase verification is not configured.",
    );
  try {
    const value = JSON.parse(raw) as Partial<PlayServiceAccount>;
    if (!value.client_email || !value.private_key) throw new Error("missing");
    return value as PlayServiceAccount;
  } catch {
    throw new ApiError(
      503,
      "GOOGLE_PLAY_NOT_CONFIGURED",
      "Google Play service-account configuration is invalid.",
    );
  }
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function playAccessToken(): Promise<string> {
  const account = getPlayServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))) +
    "." +
    b64url(
      new TextEncoder().encode(
        JSON.stringify({
          iss: account.client_email,
          scope: "https://www.googleapis.com/auth/androidpublisher",
          aud: account.token_uri ?? "https://oauth2.googleapis.com/token",
          iat: now,
          exp: now + 3600,
        }),
      ),
    );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(pemBytes(account.private_key)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    toArrayBuffer(new TextEncoder().encode(unsigned)),
  );
  const response = await fetch(account.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + b64url(new Uint8Array(signature)),
    }),
  });
  const result = (await response.json()) as { access_token?: string };
  if (!response.ok || !result.access_token)
    throw new ApiError(502, "GOOGLE_PLAY_AUTH_FAILED", "Google Play authorization failed.");
  return result.access_token;
}

export type GooglePlayProduct = {
  productId: string;
  title: string;
  description: string;
  credits: number;
  creditMinor: number;
  currency: string;
  active: boolean;
};

export function getGooglePlayProducts(
  config: Record<string, unknown>,
  requestedCurrency = "NGN",
): GooglePlayProduct[] {
  const currency = requireCurrency(requestedCurrency);
  const raw = config["googlePlayProducts"];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): GooglePlayProduct[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (
      row["active"] !== true ||
      typeof row["productId"] !== "string" ||
      !/^[A-Za-z0-9._-]{1,150}$/.test(row["productId"]) ||
      typeof row["title"] !== "string" ||
      typeof row["credits"] !== "number" ||
      !Number.isSafeInteger(row["credits"]) ||
      row["credits"] < 1 ||
      (row["creditMinorByCurrency"] === undefined &&
        (currency !== "NGN" || typeof row["creditMinor"] !== "number"))
    )
      return [];
    const perCurrency =
      row["creditMinorByCurrency"] && typeof row["creditMinorByCurrency"] === "object"
        ? (row["creditMinorByCurrency"] as Record<string, unknown>)
        : {};
    const creditMinor =
      perCurrency[currency] ?? (currency === "NGN" ? row["creditMinor"] : undefined);
    if (typeof creditMinor !== "number" || !Number.isSafeInteger(creditMinor) || creditMinor < 1)
      return [];
    return [
      {
        productId: row["productId"],
        title: row["title"],
        description: typeof row["description"] === "string" ? row["description"] : "",
        credits: row["credits"],
        creditMinor,
        currency,
        active: true,
      },
    ];
  });
}

export async function googlePlayAccountId(uid: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(uid));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyGooglePlayProduct(input: {
  packageName: string;
  productId: string;
  purchaseToken: string;
  obfuscatedAccountId: string;
}): Promise<Record<string, unknown>> {
  if (
    !/^[A-Za-z0-9._]+$/.test(input.packageName) ||
    !/^[A-Za-z0-9._-]{1,150}$/.test(input.productId) ||
    !/^[a-f0-9]{64}$/.test(input.obfuscatedAccountId) ||
    input.purchaseToken.length < 20 ||
    input.purchaseToken.length > 4096
  ) {
    throw new ApiError(
      400,
      "PLAY_PURCHASE_INVALID",
      "The Google Play purchase details are invalid.",
    );
  }
  const accessToken = await playAccessToken();
  const url =
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
    encodeURIComponent(input.packageName) +
    "/purchases/products/" +
    encodeURIComponent(input.productId) +
    "/tokens/" +
    encodeURIComponent(input.purchaseToken);
  const response = await fetch(url, { headers: { authorization: "Bearer " + accessToken } });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new ApiError(
      402,
      "PLAY_PURCHASE_NOT_VERIFIED",
      "Google Play could not verify this purchase.",
    );
  if (data["purchaseState"] !== 0) {
    throw new ApiError(
      402,
      "PLAY_PURCHASE_NOT_COMPLETED",
      "This Google Play purchase is not completed.",
    );
  }
  if (data["obfuscatedExternalAccountId"] !== input.obfuscatedAccountId) {
    throw new ApiError(
      403,
      "PLAY_ACCOUNT_MISMATCH",
      "This Google Play purchase is not linked to the signed-in account.",
    );
  }
  if (data["quantity"] !== undefined && data["quantity"] !== 1) {
    throw new ApiError(
      400,
      "PLAY_QUANTITY_UNSUPPORTED",
      "This purchase quantity is not supported.",
    );
  }
  return data;
}

export async function consumeGooglePlayProduct(input: {
  packageName: string;
  productId: string;
  purchaseToken: string;
}): Promise<void> {
  const accessToken = await playAccessToken();
  const url =
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
    encodeURIComponent(input.packageName) +
    "/purchases/products/" +
    encodeURIComponent(input.productId) +
    "/tokens/" +
    encodeURIComponent(input.purchaseToken) +
    ":consume";
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    // Two concurrent verification retries can race to consume the same token.
    // Confirm the provider state before deciding whether the retry failed.
    const confirmation = await fetch(
      "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
        encodeURIComponent(input.packageName) +
        "/purchases/products/" +
        encodeURIComponent(input.productId) +
        "/tokens/" +
        encodeURIComponent(input.purchaseToken),
      { headers: { authorization: "Bearer " + accessToken } },
    );
    const state = confirmation.ok ? ((await confirmation.json()) as Record<string, unknown>) : null;
    if (state?.["consumptionState"] !== 1) {
      throw new ApiError(
        502,
        "PLAY_PURCHASE_CONSUME_FAILED",
        "Google Play could not finalize this wallet purchase. Retry verification to complete it.",
      );
    }
  }
}

export async function creditGooglePlayPurchase(
  fs: Firestore,
  input: {
    uid: string;
    productId: string;
    purchaseToken: string;
    orderId: string | null;
    creditMinor: number;
    currency?: string;
  },
): Promise<{ credited: boolean; balanceMinor: number }> {
  if (!Number.isSafeInteger(input.creditMinor) || input.creditMinor < 1) {
    throw new ApiError(400, "PLAY_CREDIT_INVALID", "The configured purchase credit is invalid.");
  }
  const currency = requireCurrency(input.currency ?? "NGN");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input.purchaseToken),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const paymentPath = "payments/googleplay_" + hash;
  const walletPath = "wallets/" + input.uid;
  const ledgerPath = "ledger/googleplay_" + hash;
  return fs.transact<{ credited: boolean; balanceMinor: number }>(
    [paymentPath, walletPath, ledgerPath],
    (docs) => {
      const payment = docs[0],
        wallet = docs[1] ?? {},
        ledger = docs[2];
      const balance =
        typeof wallet["balanceMinor"] === "number" && Number.isSafeInteger(wallet["balanceMinor"])
          ? (wallet["balanceMinor"] as number)
          : 0;
      const walletCurrency =
        typeof wallet["currency"] === "string" ? (wallet["currency"] as string) : currency;
      if (walletCurrency !== currency)
        throw new ApiError(
          409,
          "WALLET_CURRENCY_MISMATCH",
          "This Google Play product does not match your wallet currency.",
        );
      if (payment || ledger) {
        if (
          payment?.["uid"] !== input.uid ||
          payment?.["productId"] !== input.productId ||
          (payment?.["currency"] ?? "NGN") !== currency ||
          ledger?.["currency"] !== currency
        ) {
          throw new ApiError(
            409,
            "PLAY_PURCHASE_ALREADY_CLAIMED",
            "This Google Play purchase has already been claimed.",
          );
        }
        return { result: { credited: false, balanceMinor: balance }, writes: [] };
      }
      const next = balance + input.creditMinor;
      if (!Number.isSafeInteger(next))
        throw new ApiError(
          400,
          "WALLET_LIMIT_EXCEEDED",
          "The wallet balance exceeds the supported amount.",
        );
      const now = new Date().toISOString();
      return {
        result: { credited: true, balanceMinor: next },
        writes: [
          {
            update: {
              name: fs.docName(walletPath),
              fields: encodeFields({ balanceMinor: next, currency, updatedAt: now }),
            },
            updateMask: { fieldPaths: ["balanceMinor", "currency", "updatedAt"] },
          },
          {
            update: {
              name: fs.docName(paymentPath),
              fields: encodeFields({
                uid: input.uid,
                productId: input.productId,
                orderId: input.orderId,
                purchaseTokenHash: hash,
                provider: "google_play",
                status: "credited",
                creditMinor: input.creditMinor,
                currency,
                creditedAt: now,
              }),
            },
            currentDocument: { exists: false },
          },
          {
            update: {
              name: fs.docName(ledgerPath),
              fields: encodeFields({
                uid: input.uid,
                kind: "wallet_topup",
                description: "Google Play wallet top-up",
                amountMinor: input.creditMinor,
                productId: input.productId,
                currency,
                provider: "google_play",
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
