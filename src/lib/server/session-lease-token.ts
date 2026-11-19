import { ApiError } from "./firebase-admin";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type SessionLeaseClaims = {
  sid: string;
  seq: number;
  positionMs: number;
  billedSeconds: number;
  leaseExp: number;
};

function encode(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value))
    throw new ApiError(401, "SESSION_LEASE_INVALID", "The playback lease is invalid.");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4)), (char) =>
    char.charCodeAt(0),
  );
}
async function key(secret: string): Promise<CryptoKey> {
  if (secret.length < 32)
    throw new ApiError(503, "STREAM_SIGNING_NOT_CONFIGURED", "Playback signing is not configured.");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSessionLeaseToken(
  claims: SessionLeaseClaims,
  secret = process.env["STREAMING_HMAC_SECRET"] ?? "",
): Promise<string> {
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(claims.sid) ||
    !Number.isSafeInteger(claims.seq) ||
    claims.seq < 0 ||
    !Number.isSafeInteger(claims.positionMs) ||
    claims.positionMs < 0 ||
    !Number.isSafeInteger(claims.billedSeconds) ||
    claims.billedSeconds < 0 ||
    !Number.isSafeInteger(claims.leaseExp) ||
    claims.leaseExp <= Math.floor(Date.now() / 1000) ||
    claims.leaseExp - Math.floor(Date.now() / 1000) > 60
  ) {
    throw new ApiError(
      400,
      "SESSION_LEASE_CLAIMS_INVALID",
      "The playback lease claims are invalid.",
    );
  }
  const payload = encode(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(payload));
  return payload + "." + encode(new Uint8Array(signature));
}

export async function verifySessionLeaseToken(
  token: string,
  expectedSessionId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  secret = process.env["STREAMING_HMAC_SECRET"] ?? "",
): Promise<SessionLeaseClaims> {
  if (token.length > 2048)
    throw new ApiError(401, "SESSION_LEASE_INVALID", "The playback lease is invalid.");
  const parts = token.split(".");
  if (parts.length !== 2)
    throw new ApiError(401, "SESSION_LEASE_INVALID", "The playback lease is invalid.");
  let claims: SessionLeaseClaims;
  try {
    claims = JSON.parse(decoder.decode(decode(parts[0]!))) as SessionLeaseClaims;
  } catch {
    throw new ApiError(401, "SESSION_LEASE_INVALID", "The playback lease is invalid.");
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    await key(secret),
    decode(parts[1]!).slice().buffer as ArrayBuffer,
    encoder.encode(parts[0]!).slice().buffer as ArrayBuffer,
  );
  if (
    !valid ||
    claims.sid !== expectedSessionId ||
    !Number.isSafeInteger(claims.seq) ||
    claims.seq < 0 ||
    !Number.isSafeInteger(claims.positionMs) ||
    claims.positionMs < 0 ||
    !Number.isSafeInteger(claims.billedSeconds) ||
    claims.billedSeconds < 0 ||
    !Number.isSafeInteger(claims.leaseExp) ||
    claims.leaseExp <= nowSeconds ||
    claims.leaseExp > nowSeconds + 60
  ) {
    throw new ApiError(401, "SESSION_LEASE_INVALID", "The playback lease is invalid or expired.");
  }
  return claims;
}
