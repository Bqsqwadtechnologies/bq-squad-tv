import { ApiError } from "./firebase-admin";

export type ReconciliationFinding =
  | "provider_record_missing"
  | "local_record_missing"
  | "amount_mismatch"
  | "currency_mismatch"
  | "status_mismatch"
  | "matched";

export type ReconciliationRecord = {
  reference: string;
  amountMinor: number;
  currency: string;
  status: string;
};

function validRecord(record: ReconciliationRecord): boolean {
  return /^[A-Za-z0-9_-]{8,120}$/.test(record.reference) &&
    Number.isSafeInteger(record.amountMinor) && record.amountMinor >= 0 &&
    /^[A-Z]{3}$/.test(record.currency) &&
    typeof record.status === "string" && record.status.length > 0 && record.status.length <= 40;
}

/** Compare normalized provider and platform facts without mutating financial history. */
export function classifyPaymentReconciliation(
  local: ReconciliationRecord | null,
  provider: ReconciliationRecord | null,
): ReconciliationFinding {
  if (local && !validRecord(local)) throw new ApiError(400, "PAYMENT_RECONCILIATION_LOCAL_INVALID", "The local payment record is invalid.");
  if (provider && !validRecord(provider)) throw new ApiError(400, "PAYMENT_RECONCILIATION_PROVIDER_INVALID", "The provider payment record is invalid.");
  if (!local && !provider) throw new ApiError(400, "PAYMENT_RECONCILIATION_EMPTY", "At least one payment record is required.");
  if (!local) return "local_record_missing";
  if (!provider) return "provider_record_missing";
  if (local.reference !== provider.reference) throw new ApiError(409, "PAYMENT_RECONCILIATION_REFERENCE_MISMATCH", "Payment references do not match.");
  if (local.amountMinor !== provider.amountMinor) return "amount_mismatch";
  if (local.currency !== provider.currency) return "currency_mismatch";
  if (local.status !== provider.status) return "status_mismatch";
  return "matched";
}

/** Stable review key: repeated reconciliation runs update the same case, never create ledger entries. */
export async function paymentReviewKey(provider: string, reference: string): Promise<string> {
  if (!/^(paystack|google_play)$/.test(provider) || !/^[A-Za-z0-9_-]{8,120}$/.test(reference)) {
    throw new ApiError(400, "PAYMENT_REVIEW_KEY_INVALID", "The payment review reference is invalid.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(provider + ":" + reference));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
