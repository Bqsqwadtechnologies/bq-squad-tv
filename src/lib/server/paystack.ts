import { ApiError, type Firestore, encodeFields } from "./firebase-admin";

function requiredSecret(): string {
  const secret = process.env["PAYSTACK_SECRET_KEY"];
  if (!secret) throw new ApiError(503, "PAYSTACK_NOT_CONFIGURED", "Website payments are not configured.");
  return secret;
}

export async function verifyPaystackSignature(rawBody: string, signature: string | null): Promise<void> {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) {
    throw new ApiError(401, "PAYSTACK_SIGNATURE_INVALID", "The payment notification signature is invalid.");
  }
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(requiredSecret()), { name: "HMAC", hash: "SHA-512" }, false, ["verify"],
  );
  const bytes = Uint8Array.from(signature.match(/.{2}/g) ?? [], part => Number.parseInt(part, 16));
  const valid = await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(rawBody));
  if (!valid) throw new ApiError(401, "PAYSTACK_SIGNATURE_INVALID", "The payment notification signature is invalid.");
}

export async function fetchPaystackVerification(reference: string): Promise<Record<string, unknown>> {
  const response = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
    headers: { authorization: "Bearer " + requiredSecret(), accept: "application/json" },
  });
  const payload = await response.json() as { status?: boolean; message?: string; data?: Record<string, unknown> };
  if (!response.ok || payload.status !== true || !payload.data) {
    throw new ApiError(502, "PAYSTACK_VERIFY_FAILED", "The payment provider could not verify this transaction.");
  }
  return payload.data;
}

export async function creditPaystackPayment(
  fs: Firestore,
  input: { reference: string; uid: string; amountMinor: number; creditMinor: number; email: string | null },
): Promise<{ credited: boolean; balanceMinor: number }> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1 ||
      !Number.isSafeInteger(input.creditMinor) || input.creditMinor < 1) {
    throw new ApiError(400, "PAYMENT_AMOUNT_INVALID", "The verified payment amount is invalid.");
  }
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(input.reference)) throw new ApiError(400, "PAYMENT_REFERENCE_INVALID", "The payment reference is invalid.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.reference));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const paymentPath = "payments/paystack_" + input.reference;
  const walletPath = "wallets/" + input.uid;
  const ledgerPath = "ledger/paystack_" + hash;
  return fs.transact([paymentPath, walletPath, ledgerPath], docs => {
    const payment = docs[0];
    const wallet = docs[1] ?? {};
    const ledger = docs[2];
    const currentBalance = typeof wallet["balanceMinor"] === "number" && Number.isSafeInteger(wallet["balanceMinor"])
      ? wallet["balanceMinor"] as number : 0;
    if (payment?.["status"] === "credited" || ledger) {
      return { result: { credited: false, balanceMinor: currentBalance }, writes: [] };
    }
    const nextBalance = currentBalance + input.creditMinor;
    if (!Number.isSafeInteger(nextBalance)) throw new ApiError(400, "WALLET_LIMIT_EXCEEDED", "The wallet balance exceeds the supported amount.");
    const now = new Date().toISOString();
    return {
      result: { credited: true, balanceMinor: nextBalance },
      writes: [
        { update: { name: fs.docName(walletPath), fields: encodeFields({ balanceMinor: nextBalance, currency: "NGN", updatedAt: now }) }, updateMask: { fieldPaths: ["balanceMinor", "currency", "updatedAt"] } },
        { update: { name: fs.docName(paymentPath), fields: encodeFields({ reference: input.reference, uid: input.uid, email: input.email, amountMinor: input.amountMinor, creditMinor: input.creditMinor, currency: "NGN", provider: "paystack", status: "credited", creditedAt: now }) }, updateMask: { fieldPaths: ["reference", "uid", "email", "amountMinor", "creditMinor", "currency", "provider", "status", "creditedAt"] } },
        { update: { name: fs.docName(ledgerPath), fields: encodeFields({ uid: input.uid, kind: "wallet_topup", description: "Website wallet top-up", amountMinor: input.creditMinor, reference: input.reference, provider: "paystack", createdAt: now }) }, currentDocument: { exists: false } },
      ],
    };
  });
}

export function getPaystackTopup(config: Record<string, unknown>, packageId: string): { amountMinor: number; creditMinor: number } {
  const offers = config["walletTopups"];
  const offer = offers && typeof offers === "object" ? (offers as Record<string, unknown>)[packageId] : null;
  if (!offer || typeof offer !== "object") throw new ApiError(400, "TOPUP_UNAVAILABLE", "This wallet top-up is not available.");
  const row = offer as Record<string, unknown>;
  const amountMinor = row["amountMinor"];
  const creditMinor = row["creditMinor"] ?? amountMinor;
  if (typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor) || amountMinor < 1 ||
      typeof creditMinor !== "number" || !Number.isSafeInteger(creditMinor) || creditMinor < 1) {
    throw new ApiError(503, "TOPUP_CONFIG_INVALID", "The wallet top-up configuration is invalid.");
  }
  return { amountMinor, creditMinor };
}
