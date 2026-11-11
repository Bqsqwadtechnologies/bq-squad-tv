// Shared playback-session helpers. Sessions bill per elapsed second using
// server timestamps only; client clocks and client-supplied elapsed time are
// never trusted.

import { ApiError } from "@/lib/server/firebase-admin";

export type SessionDoc = Record<string, unknown>;

const MICRO_UNITS_PER_MINOR = 1_000_000n;
const MICRO_UNITS_PER_MINUTE = 60n * MICRO_UNITS_PER_MINOR;

export function requireSessionOwned(session: SessionDoc | null, sessionId: string, uid: string): SessionDoc {
  if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "This playback session does not exist.");
  if (session["uid"] !== uid) throw new ApiError(403, "FORBIDDEN", "This playback session belongs to another account.");
  return session;
}

export function elapsedSeconds(fromIso: unknown, to: Date = new Date()): number {
  if (typeof fromIso !== "string") return 0;
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return 0;
  const seconds = Math.floor((to.getTime() - from) / 1000);
  return Math.max(0, Math.min(seconds, 300));
}

export function costForCumulativeSeconds(seconds: number, ratePerMinuteMinor: number): number {
  if (!Number.isSafeInteger(seconds) || seconds < 0 ||
      !Number.isSafeInteger(ratePerMinuteMinor) || ratePerMinuteMinor < 0) {
    throw new ApiError(400, "INVALID_METERING_INPUT", "Session metering values must be non-negative safe integers.");
  }
  const accruedMicroUnits = BigInt(seconds) * BigInt(ratePerMinuteMinor) * MICRO_UNITS_PER_MINOR;
  const minor = (accruedMicroUnits + MICRO_UNITS_PER_MINUTE - 1n) / MICRO_UNITS_PER_MINUTE;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ApiError(400, "METERING_LIMIT_EXCEEDED", "The session charge exceeds the supported amount.");
  }
  return Number(minor);
}

export function incrementalSessionCharge(
  previouslyBilledSeconds: number,
  newlyElapsedSeconds: number,
  ratePerMinuteMinor: number,
): { billedSeconds: number; chargeMinor: number; sessionTotalMinor: number } {
  if (!Number.isSafeInteger(previouslyBilledSeconds) || previouslyBilledSeconds < 0 ||
      !Number.isSafeInteger(newlyElapsedSeconds) || newlyElapsedSeconds < 0 ||
      newlyElapsedSeconds > 300) {
    throw new ApiError(400, "INVALID_METERING_INPUT", "Session elapsed time is invalid.");
  }
  const billedSeconds = previouslyBilledSeconds + newlyElapsedSeconds;
  if (!Number.isSafeInteger(billedSeconds)) {
    throw new ApiError(400, "METERING_LIMIT_EXCEEDED", "The session duration exceeds the supported amount.");
  }
  const previousTotal = costForCumulativeSeconds(previouslyBilledSeconds, ratePerMinuteMinor);
  const sessionTotalMinor = costForCumulativeSeconds(billedSeconds, ratePerMinuteMinor);
  return { billedSeconds, chargeMinor: sessionTotalMinor - previousTotal, sessionTotalMinor };
}

export function maxAffordableSeconds(
  previouslyBilledSeconds: number,
  requestedSeconds: number,
  ratePerMinuteMinor: number,
  availableMinor: number,
): number {
  if (!Number.isSafeInteger(availableMinor) || availableMinor < 0) {
    throw new ApiError(400, "INVALID_METERING_INPUT", "Available wallet amount is invalid.");
  }
  let low = 0;
  let high = Math.min(300, Math.max(0, requestedSeconds));
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const charge = incrementalSessionCharge(previouslyBilledSeconds, middle, ratePerMinuteMinor).chargeMinor;
    if (charge <= availableMinor) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function producerShareMinor(chargeMinor: number, shareBps: number): number {
  if (!Number.isSafeInteger(chargeMinor) || chargeMinor < 0 ||
      !Number.isSafeInteger(shareBps) || shareBps < 0 || shareBps > 10_000) {
    throw new ApiError(400, "INVALID_REVENUE_SPLIT", "The producer revenue split is invalid.");
  }
  return Number((BigInt(chargeMinor) * BigInt(shareBps)) / 10_000n);
}

export function safeAddMinor(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || left < 0 || !Number.isSafeInteger(right) || right < 0 ||
      !Number.isSafeInteger(left + right)) {
    throw new ApiError(400, "MONEY_LIMIT_EXCEEDED", "The monetary total exceeds the supported amount.");
  }
  return left + right;
}

export function costForSeconds(seconds: number, ratePerMinuteMinor: number): number {
  return costForCumulativeSeconds(seconds, ratePerMinuteMinor);
}

export function toSessionSnapshot(
  sessionId: string,
  session: SessionDoc,
  balanceMinor: number,
  playbackUrl: string | null,
): Record<string, unknown> {
  const rate = typeof session["ratePerMinuteMinor"] === "number" ? session["ratePerMinuteMinor"] as number : 0;
  const billedSeconds = typeof session["billedSeconds"] === "number" ? session["billedSeconds"] as number : 0;
  const sessionTotalMinor = typeof session["sessionTotalMinor"] === "number" ? session["sessionTotalMinor"] as number : 0;
  const remaining = rate > 0 && balanceMinor > 0
    ? Number((BigInt(balanceMinor) * 60n) / BigInt(rate))
    : 0;
  return {
    sessionId,
    playbackUrl: playbackUrl ?? (typeof session["playbackUrl"] === "string" ? session["playbackUrl"] : ""),
    ratePerMinuteMinor: rate,
    walletBalanceMinor: balanceMinor,
    currency: typeof session["currency"] === "string" ? session["currency"] as string : "NGN",
    timeRemainingSeconds: Math.min(Number.MAX_SAFE_INTEGER, remaining),
    billedSeconds,
    sessionTotalMinor,
    active: session["active"] === true,
  };
}
