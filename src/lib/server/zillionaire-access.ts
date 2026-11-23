import crypto from "crypto";
import { ApiError } from "./firebase-admin";

export const ZILLIONAIRE_UNLOCK_HEADER = "x-zillionaire-unlock";
export const ZILLIONAIRE_UNLOCK_COOKIE = "zillionaire_unlock";
export const OWNER_IDLE_TIMEOUT_SECONDS = 15 * 60;
export const UNLOCK_TTL_SECONDS = 8 * 60 * 60;
export const OWNER_SESSION_ABSOLUTE_SECONDS = 8 * 60 * 60;
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptState {
  count: number;
  lockedUntil: number | null;
  lastAttemptAt: number;
}

const attemptStore = new Map<string, AttemptState>();
const revokedSessions = new Set<string>();
export function revokeOwnerSession(sessionId: string): void {
  revokedSessions.add(sessionId);
}
export function clearRevokedOwnerSessions(): void {
  revokedSessions.clear();
}

function getSigningSecret(): string {
  return (
    process.env["SESSION_SECRET"] ||
    process.env["WEB_SESSION_SECRET"] ||
    "bqsqwad-zillionaire-unlock-key-default"
  );
}

function removeSecretLineEnding(value: string): string {
  // Secret managers can append one terminal newline when a value is pasted.
  // Remove only that line ending; preserve intentional spaces and all other bytes.
  return value.endsWith("\r\n") ? value.slice(0, -2)
    : value.endsWith("\n") || value.endsWith("\r") ? value.slice(0, -1)
    : value;
}

export function isAccessPasswordConfigured(): boolean {
  const password = process.env["ZILLIONAIRE_ACCESS_PASSWORD"];
  return typeof password === "string" && removeSecretLineEnding(password).length > 0;
}

function getSecretHash(): Buffer | null {
  const password = process.env["ZILLIONAIRE_ACCESS_PASSWORD"];
  if (typeof password !== "string") return null;
  const normalizedPassword = removeSecretLineEnding(password);
  if (normalizedPassword.length === 0) return null;
  return crypto.createHash("sha256").update(normalizedPassword, "utf8").digest();
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

  const normalizedProvidedPassword = removeSecretLineEnding(providedPassword);
  const providedHash = crypto.createHash("sha256").update(normalizedProvidedPassword, "utf8").digest();

  return crypto.timingSafeEqual(secretHash, providedHash);
}

export interface UnlockTokenPayload {
  uid: string;
  iat: number;
  exp: number;
  deviceHash?: string | undefined;
  sessionId?: string | undefined;
  absoluteExp?: number | undefined;
}

export function createUnlockToken(
  uid: string,
  deviceHash?: string,
): { token: string; expiresAt: number; sessionId: string } {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + OWNER_SESSION_ABSOLUTE_SECONDS;
  const payload: UnlockTokenPayload = {
    uid,
    iat: now,
    exp: expiresAt,
    deviceHash,
    sessionId: crypto.randomUUID(),
    absoluteExp: now + OWNER_SESSION_ABSOLUTE_SECONDS,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest("base64url");

  return {
    token: `${payloadB64}.${signature}`,
    expiresAt,
    sessionId: payload.sessionId!,
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
    .digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(signature, "base64url");
  } catch {
    return { valid: false, reason: "INVALID_SIGNATURE" };
  }

  if (
    actualSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(actualSignature, expectedSignature)
  ) {
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
  const absoluteExp = typeof payload.absoluteExp === "number" ? payload.absoluteExp : payload.exp;
  if (payload.exp <= now || absoluteExp <= now) return { valid: false, reason: "EXPIRED" };
  if (payload.sessionId && revokedSessions.has(payload.sessionId))
    return { valid: false, reason: "REVOKED" };

  return { valid: true, expiresAt: Math.min(payload.exp, absoluteExp) };
}

export function refreshUnlockToken(
  token: string,
  expectedUid: string,
): { token: string; expiresAt: number } | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const verified = parseAndVerifyUnlockToken(token, expectedUid);
  if (!verified.valid) return null;
  let payload: UnlockTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as UnlockTokenPayload;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const absoluteExp = typeof payload.absoluteExp === "number" ? payload.absoluteExp : now;
  const exp = Math.min(now + OWNER_SESSION_ABSOLUTE_SECONDS, absoluteExp);
  if (exp <= now) return null;
  payload.exp = exp;
  const refreshed = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const refreshedSignature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(refreshed)
    .digest("base64url");
  return { token: `${refreshed}.${refreshedSignature}`, expiresAt: exp };
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

export async function requireZillionaireUnlock(
  request: Request,
  uid: string,
  fs?: import("./firebase-admin").Firestore,
): Promise<void> {
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
  if (fs) {
    const token = extractUnlockToken(request);
    const encodedPayload = token?.split(".")[0];
    try {
      const payload = encodedPayload
        ? (JSON.parse(
            Buffer.from(encodedPayload, "base64url").toString("utf8"),
          ) as UnlockTokenPayload)
        : null;
      const actualDevice = crypto
        .createHash("sha256")
        .update(request.headers.get("user-agent") || "Unknown browser")
        .digest("hex");
      if (payload?.deviceHash && payload.deviceHash !== actualDevice)
        throw new ApiError(
          428,
          "ZILLIONAIRE_DEVICE_CHALLENGE_REQUIRED",
          "Owner session device changed. Unlock again.",
        );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(423, "ZILLIONAIRE_LOCKED", "Owner session is invalid. Unlock again.");
    }
    const encoded = token?.split(".")[0];
    let sessionId: string | undefined;
    try {
      sessionId = encoded
        ? (JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as UnlockTokenPayload)
            .sessionId
        : undefined;
    } catch {
      sessionId = undefined;
    }
    if (!sessionId)
      throw new ApiError(423, "ZILLIONAIRE_LOCKED", "Owner session is invalid. Unlock again.");
    const session = await fs.getDoc(`zillionaireOwnerSessions/${uid}_${sessionId}`);
    if (!session || session["revoked"] === true)
      throw new ApiError(
        423,
        "ZILLIONAIRE_SESSION_REVOKED",
        "This owner session has ended. Unlock again.",
      );
    const lastSeenMs = Date.parse(String(session["lastSeenAt"] || session["createdAt"] || ""));
    if (!Number.isFinite(lastSeenMs) || Date.now() - lastSeenMs > OWNER_IDLE_TIMEOUT_SECONDS * 1000)
      throw new ApiError(
        423,
        "ZILLIONAIRE_IDLE_TIMEOUT",
        "Owner session idle timeout reached. Unlock again.",
      );
    await fs.patchDoc(`zillionaireOwnerSessions/${uid}_${sessionId}`, {
      lastSeenAt: new Date().toISOString(),
    });
  }
}

export const STEP_UP_TTL_SECONDS = 5 * 60;
export const ZILLIONAIRE_STEP_UP_HEADER = "x-zillionaire-step-up";
export type StepUpScope =
  "wallet_adjust" | "payment_reversal" | "permanent_delete" | "team_manage" | "payout_settlement" | "payout_review" | "kyc_case_export";

export function createStepUpToken(
  uid: string,
  scope: StepUpScope,
): { token: string; expiresAt: number } {
  const iat = Math.floor(Date.now() / 1000);
  const payload = { uid, scope, iat, exp: iat + STEP_UP_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(encoded)
    .digest("base64url");
  return { token: `${encoded}.${signature}`, expiresAt: payload.exp };
}

export function requireStepUp(request: Request, uid: string, scope: StepUpScope): void {
  const token = request.headers.get(ZILLIONAIRE_STEP_UP_HEADER);
  if (!token)
    throw new ApiError(
      428,
      "STEP_UP_REQUIRED",
      "Re-authenticate to continue this sensitive action.",
    );
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra)
    throw new ApiError(
      428,
      "STEP_UP_REQUIRED",
      "Re-authenticate to continue this sensitive action.",
    );
  const expected = crypto.createHmac("sha256", getSigningSecret()).update(encoded).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    throw new ApiError(
      428,
      "STEP_UP_REQUIRED",
      "Re-authenticate to continue this sensitive action.",
    );
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected))
    throw new ApiError(
      428,
      "STEP_UP_REQUIRED",
      "Re-authenticate to continue this sensitive action.",
    );
  let payload: { uid?: string; scope?: string; exp?: number };
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as typeof payload;
  } catch {
    throw new ApiError(
      428,
      "STEP_UP_REQUIRED",
      "Re-authenticate to continue this sensitive action.",
    );
  }
  if (
    payload.uid !== uid ||
    payload.scope !== scope ||
    typeof payload.exp !== "number" ||
    payload.exp <= Date.now() / 1000
  )
    throw new ApiError(
      428,
      "STEP_UP_REQUIRED",
      "Re-authenticate to continue this sensitive action.",
    );
}
