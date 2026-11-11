// Shared playback-session helpers. Sessions bill per elapsed second using
// server timestamps only; client clocks and client-supplied elapsed time are
// never trusted.

import { cumulativeCostKobo } from "@/lib/server/money";
import { ApiError } from "@/lib/server/firebase-admin";

export type SessionDoc = Record<string, unknown>;

export type ReportedPlaybackState = "playing" | "paused" | "buffering" | "idle" | "ended";

/**
 * Conservative client-player evidence: bill only when consecutive samples
 * both report active playback and the media position advanced. The interval
 * is capped by server elapsed time; client clocks are never used.
 *
 * This is not cryptographic proof of playback. Production release also
 * requires verified app attestation and provider-side authorization/telemetry.
 */
export function reportedPlaybackSeconds(
  previousState: unknown,
  currentState: ReportedPlaybackState,
  previousPositionMs: unknown,
  currentPositionMs: number,
  serverElapsedSeconds: number,
): number {
  if (previousState !== "playing" || currentState !== "playing") return 0;
  if (!Number.isSafeInteger(previousPositionMs) || (previousPositionMs as number) < 0 ||
      !Number.isSafeInteger(currentPositionMs) || currentPositionMs < 0 ||
      !Number.isSafeInteger(serverElapsedSeconds) || serverElapsedSeconds <= 0 ||
      serverElapsedSeconds > 45) return 0;
  const advancedMs = currentPositionMs - (previousPositionMs as number);
  if (advancedMs < 1000) return 0;
  return Math.min(serverElapsedSeconds, Math.floor(advancedMs / 1000));
}


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

/**
 * Session routes use NGN minor units (kobo). Delegate to the canonical exact
 * money helper so heartbeat and end settlement use the same half-up rounding
 * rule and cannot drift from other PAYG calculations.
 */
export function costForCumulativeSeconds(seconds: number, ratePerMinuteMinor: number): number {
  return cumulativeCostKobo(ratePerMinuteMinor, seconds);
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
