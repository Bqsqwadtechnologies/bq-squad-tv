// Shared playback-session helpers. Sessions bill per elapsed second using
// server timestamps only; client clocks and client-supplied elapsed time are
// never trusted.

import { ApiError } from "@/lib/server/firebase-admin";

export type SessionDoc = Record<string, unknown>;

export function requireSessionOwned(session: SessionDoc | null, sessionId: string, uid: string): SessionDoc {
  if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "This playback session does not exist.");
  if (session["uid"] !== uid) throw new ApiError(403, "FORBIDDEN", "This playback session belongs to another account.");
  return session;
}

/** Whole seconds elapsed between two ISO timestamps; never negative, capped at 5 minutes per interval. */
export function elapsedSeconds(fromIso: unknown, to: Date = new Date()): number {
  if (typeof fromIso !== "string") return 0;
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return 0;
  const seconds = Math.floor((to.getTime() - from) / 1000);
  return Math.max(0, Math.min(seconds, 300));
}

/** Cost in minor units for a number of elapsed seconds at a per-minute rate, rounded up to the nearest second of charge. */
export function costForSeconds(seconds: number, ratePerMinuteMinor: number): number {
  if (seconds <= 0 || ratePerMinuteMinor <= 0) return 0;
  return Math.ceil((seconds * ratePerMinuteMinor) / 60);
}

export function toSessionSnapshot(
  sessionId: string,
  session: SessionDoc,
  balanceMinor: number,
  playbackUrl: string | null,
): Record<string, unknown> {
  const rate = typeof session["ratePerMinuteMinor"] === "number" ? (session["ratePerMinuteMinor"] as number) : 0;
  const billedSeconds = typeof session["billedSeconds"] === "number" ? (session["billedSeconds"] as number) : 0;
  const sessionTotalMinor = typeof session["sessionTotalMinor"] === "number" ? (session["sessionTotalMinor"] as number) : 0;
  return {
    sessionId,
    playbackUrl: playbackUrl ?? (typeof session["playbackUrl"] === "string" ? session["playbackUrl"] : ""),
    ratePerMinuteMinor: rate,
    walletBalanceMinor: balanceMinor,
    currency: typeof session["currency"] === "string" ? session["currency"] : "NGN",
    timeRemainingSeconds: rate > 0 ? Math.floor((balanceMinor * 60) / rate) : 0,
    sessionTotalMinor: sessionTotalMinor + costForSeconds(billedSeconds, 0),
    active: session["active"] === true,
  };
}
