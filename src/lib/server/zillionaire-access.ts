import crypto from "crypto";
import { ApiError } from "./firebase-admin";

export const ZILLIONAIRE_UNLOCK_HEADER = "x-zillionaire-unlock";
export const ZILLIONAIRE_UNLOCK_COOKIE = "zillionaire_unlock";
export const UNLOCK_TTL_SECONDS = 30 * 60; // 30 minutes
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptState {
  count: number;
  lockedUntil: number | null;
  lastAttemptAt: number;
}

const attemptStore = new Map<string, AttemptState>();

function getSigningSecret(): string {
  return (
    process.env["SESSION_SECRET"] ||
    process.env["WEB_SESSION_SECRET"] ||
    "bqsqwad-zillionaire-unlock-key-default"
  );
}

export function isAccessPasswordConfigured(): boolean {
  const pwd = (process.env["ZILLIONAIRE_ACCESS_PASSWORD"] || "").trim();
  return pwd.length > 0;
}

function getSecretHash(): Buffer | null {
  const pwd = (process.env["ZILLIONAIRE_ACCESS_PASSWORD"] || "").trim();
  if (!pwd) return null;
  return crypto.createHash("sha256").update(pwd).digest();
}

export function checkLockout(identifier: string): {
  locked: boolean;
  remainingLockSeconds: number;
} {
  const state = attemptStore.get(identifier);
  if (!state) return { locked: false, remainingLockSeconds: 0 };

  const now = Date.now();
  if (state.lockedUntil && state.lockedUntil > now) {
    const remainingSec = Math.ceil((state.lockedUntil - now) / 1000);
    return { locked: true, remainingLockSeconds: remainingSec };
  }

  if (state.lockedUntil && state.lockedUntil <= now) {
    // Lock expired, reset
    attemptStore.delete(identifier);
  }

  return { locked: false, remainingLockSeconds: 0 };
}

export function recordFailure(identifier: string): {
  locked: boolean;
  attempts: number;
  remainingAttempts: number;
  remainingLockSeconds: number;
} {
  const now = Date.now();
  const lockout = checkLockout(identifier);
  if (lockout.locked) {
    return {
      locked: true,
      attempts: MAX_ATTEMPTS,
      remainingAttempts: 0,
      remainingLockSeconds: lockout.remainingLockSeconds,
    };
  }

  let state = attemptStore.get(identifier);
  if (!state) {
    state = { count: 0, lockedUntil: null, lastAttemptAt: now };
    attemptStore.set(identifier, state);
  }

  state.count += 1;
  state.lastAttemptAt = now;

  if (state.count >= MAX_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_DURATION_MS;
    return {
      locked: true,
      attempts: state.count,
      remainingAttempts: 0,
      remainingLockSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
    };
  }

  return {
    locked: false,
    attempts: state.count,
    remainingAttempts: MAX_ATTEMPTS - state.count,
    remainingLockSeconds: 0,
  };
}

export function clearFailure(identifier: string): void {
  attemptStore.delete(identifier);
}

export function getProgressiveDelayMs(attempts: number): number {
  if (attempts <= 1) return 0;
  if (attempts === 2) return 500;
  if (attempts === 3) return 1000;
  return 2000;
}

export function verifyPasswordConstantTime(providedPassword: string): boolean {
  const secretHash = getSecretHash();
  if (!secretHash) return false;

  const providedHash = crypto.createHash("sha256").update(providedPassword.trim()).digest();

  return crypto.timingSafeEqual(secretHash, providedHash);
}

export interface UnlockTokenPayload {
  uid: string;
  iat: number;
  exp: number;
  deviceHash?: string | undefined;
}

export function createUnlockToken(
  uid: string,
  deviceHash?: string,
): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + UNLOCK_TTL_SECONDS;
  const payload: UnlockTokenPayload = {
    uid,
    iat: now,
    exp: expiresAt,
    deviceHash,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest("base64url");

  return {
    token: `${payloadB64}.${signature}`,
    expiresAt,
  };
}

export function parseAndVerifyUnlockToken(
  token: string | null | undefined,
  expectedUid: string,
): { valid: boolean; expiresAt?: number; reason?: string } {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "TOKEN_MISSING" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "MALFORMED_TOKEN" };
  }

  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return { valid: false, reason: "MALFORMED_TOKEN" };
  const expectedSignature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest("base64url");

  if (signature !== expectedSignature) {
    return { valid: false, reason: "INVALID_SIGNATURE" };
  }

  let payload: UnlockTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
  } catch {
    return { valid: false, reason: "INVALID_PAYLOAD" };
  }

  if (payload.uid !== expectedUid) {
    return { valid: false, reason: "UID_MISMATCH" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return { valid: false, reason: "EXPIRED" };
  }

  return { valid: true, expiresAt: payload.exp };
}

export function extractUnlockToken(request: Request): string | null {
  const headerToken = request.headers.get(ZILLIONAIRE_UNLOCK_HEADER);
  if (headerToken) return headerToken.trim();

  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ZILLIONAIRE_UNLOCK_COOKIE}=([^;]+)`));
    if (match && match[1]) {
      return decodeURIComponent(match[1].trim());
    }
  }

  return null;
}

export function requireZillionaireUnlock(request: Request, uid: string): void {
  if (!isAccessPasswordConfigured()) {
    throw new ApiError(
      423,
      "ZILLIONAIRE_PASSWORD_NOT_CONFIGURED",
      "ZILLIONAIRE_ACCESS_PASSWORD is not set in environment.",
    );
  }

  const token = extractUnlockToken(request);
  const result = parseAndVerifyUnlockToken(token, uid);

  if (!result.valid) {
    throw new ApiError(
      423,
      "ZILLIONAIRE_LOCKED",
      "Zillionaire dashboard is locked. Enter your access password.",
    );
  }
}
