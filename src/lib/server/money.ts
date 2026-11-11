import { ApiError } from "./firebase-admin";

const KOBO_PER_NAIRA = 100n;
const SECONDS_PER_MINUTE = 60n;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function requireNonNegativeSafeInteger(value: number, name: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ApiError(400, "INVALID_MONEY_INPUT", `${name} must be a non-negative safe integer.`);
  }
  return BigInt(value);
}

/**
 * Returns the exact cumulative charge in kobo, rounded half-up once for the
 * cumulative session total. The rate is integer kobo per minute. Because the
 * cumulative seconds are used, heartbeat boundaries cannot introduce rounding
 * drift: incremental debits are differences between two cumulative totals.
 */
export function cumulativeCostKobo(ratePerMinuteKobo: number, billableSeconds: number): number {
  const rate = requireNonNegativeSafeInteger(ratePerMinuteKobo, "ratePerMinuteKobo");
  const seconds = requireNonNegativeSafeInteger(billableSeconds, "billableSeconds");
  const numerator = rate * seconds;
  const rounded = (numerator + SECONDS_PER_MINUTE / 2n) / SECONDS_PER_MINUTE;
  if (rounded > MAX_SAFE) {
    throw new ApiError(400, "MONEY_LIMIT_EXCEEDED", "The calculated session amount exceeds the supported range.");
  }
  return Number(rounded);
}

/** Exact incremental debit between cumulative session checkpoints. */
export function incrementalCostKobo(
  ratePerMinuteKobo: number,
  previousBillableSeconds: number,
  nextBillableSeconds: number,
): number {
  if (!Number.isSafeInteger(previousBillableSeconds) || previousBillableSeconds < 0 ||
      !Number.isSafeInteger(nextBillableSeconds) || nextBillableSeconds < previousBillableSeconds) {
    throw new ApiError(400, "INVALID_MONEY_INPUT", "Cumulative billable seconds must be non-negative and monotonic.");
  }
  return cumulativeCostKobo(ratePerMinuteKobo, nextBillableSeconds) -
    cumulativeCostKobo(ratePerMinuteKobo, previousBillableSeconds);
}

/**
 * Calculates micro-kobo as an exact integer quotient plus a remainder over 60.
 * Persist both values if a workflow needs sub-kobo accrual between settlements.
 */
export function accrueMicroKobo(
  ratePerMinuteKobo: number,
  billableSeconds: number,
): { microKobo: string; remainderOver60: string } {
  const rate = requireNonNegativeSafeInteger(ratePerMinuteKobo, "ratePerMinuteKobo");
  const seconds = requireNonNegativeSafeInteger(billableSeconds, "billableSeconds");
  const numerator = rate * seconds * 1_000_000n;
  return {
    microKobo: (numerator / SECONDS_PER_MINUTE).toString(),
    remainderOver60: (numerator % SECONDS_PER_MINUTE).toString(),
  };
}

/** Converts an exact non-negative micro-kobo integer to kobo using half-up rounding. */
export function settleMicroKoboToKobo(microKobo: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(microKobo)) {
    throw new ApiError(400, "INVALID_MONEY_INPUT", "microKobo must be a non-negative integer string.");
  }
  const rounded = (BigInt(microKobo) + 500_000n) / 1_000_000n;
  if (rounded > MAX_SAFE) {
    throw new ApiError(400, "MONEY_LIMIT_EXCEEDED", "The settled amount exceeds the supported range.");
  }
  return Number(rounded);
}

/** Validates a persisted integer-kobo amount before it reaches financial code. */
export function requireKoboAmount(value: unknown, fieldName = "amountKobo"): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ApiError(400, "INVALID_MONEY_INPUT", `${fieldName} must be a non-negative integer number of kobo.`);
  }
  return value;
}

export const MONEY_UNITS = {
  currency: "NGN",
  minorUnit: "kobo",
  koboPerNaira: Number(KOBO_PER_NAIRA),
  microKoboPerKobo: 1_000_000,
} as const;
