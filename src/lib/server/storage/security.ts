import { ApiError } from "../firebase-admin";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function unb64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value))
    throw new ApiError(401, "STREAM_TOKEN_INVALID", "The playback token is invalid.");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  );
}

async function hmacKey(secret: string): Promise<CryptoKey> {
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

export type PlaybackTokenClaims = {
  sid: string;
  uid: string;
  path: string;
  exp: number;
  iat: number;
};

export async function signPlaybackToken(
  claims: PlaybackTokenClaims,
  secret = process.env["STREAMING_HMAC_SECRET"] ?? "",
): Promise<string> {
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(claims.sid) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(claims.uid) ||
    !isSafeStoragePath(claims.path) ||
    !Number.isSafeInteger(claims.exp) ||
    !Number.isSafeInteger(claims.iat) ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 900
  ) {
    throw new ApiError(400, "STREAM_TOKEN_CLAIMS_INVALID", "Playback token claims are invalid.");
  }
  const payload = b64url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    toArrayBuffer(encoder.encode(payload)),
  );
  return payload + "." + b64url(new Uint8Array(signature));
}

export async function verifyPlaybackToken(
  token: string,
  expected: { sid: string; uid: string; path: string },
  secret = process.env["STREAMING_HMAC_SECRET"] ?? "",
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<PlaybackTokenClaims> {
  if (token.length > 2048)
    throw new ApiError(401, "STREAM_TOKEN_INVALID", "The playback token is invalid.");
  const parts = token.split(".");
  if (parts.length !== 2)
    throw new ApiError(401, "STREAM_TOKEN_INVALID", "The playback token is invalid.");
  let claims: PlaybackTokenClaims;
  try {
    claims = JSON.parse(decoder.decode(unb64url(parts[0]!))) as PlaybackTokenClaims;
  } catch {
    throw new ApiError(401, "STREAM_TOKEN_INVALID", "The playback token is invalid.");
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    toArrayBuffer(unb64url(parts[1]!)),
    toArrayBuffer(encoder.encode(parts[0]!)),
  );
  if (
    !valid ||
    claims.sid !== expected.sid ||
    claims.uid !== expected.uid ||
    claims.path !== expected.path ||
    !Number.isSafeInteger(claims.iat) ||
    claims.iat > nowSeconds + 60 ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= nowSeconds ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 900
  ) {
    throw new ApiError(401, "STREAM_TOKEN_INVALID", "The playback token is invalid or expired.");
  }
  return claims;
}

export function isSafeStoragePath(path: string): boolean {
  if (
    !path ||
    path.length > 1024 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.includes("//") ||
    /%2f|%5c/i.test(path)
  )
    return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  return decoded
    .split("/")
    .every(
      (part) =>
        part.length > 0 && part !== "." && part !== ".." && /^[A-Za-z0-9._ -]{1,180}$/.test(part),
    );
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(
      /(^|[?&\s])((?:token|signature|sig|apikey|api_key|access_token)=)[^&\s]*/gi,
      "$1$2[REDACTED]",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /https?:\/\/[^\s"'<>]+\/(?:storage\/v1\/object\/sign|storage\/v1\/object\/authenticated)\/[^\s"'<>]+/gi,
      "[PRIVATE_STORAGE_URL_REDACTED]",
    )
    .replace(/sb_(?:secret|service_role)_[A-Za-z0-9_-]+/gi, "[STORAGE_SECRET_REDACTED]");
}

export type VerifiedMediaKind =
  "mp4" | "quicktime" | "matroska" | "webm" | "hls" | "mpegts" | "vtt";

export function detectMediaKind(bytes: Uint8Array): VerifiedMediaKind | null {
  if (bytes.length >= 8 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return brand === "qt  " ? "quicktime" : "mp4";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    const prefix = decoder.decode(bytes.slice(0, Math.min(bytes.length, 64))).toLowerCase();
    return prefix.includes("webm") ? "webm" : "matroska";
  }
  const text = decoder
    .decode(bytes.slice(0, Math.min(bytes.length, 512)))
    .replace(/^\uFEFF/, "")
    .trimStart();
  if (text.startsWith("#EXTM3U")) return "hls";
  if (text.startsWith("WEBVTT")) return "vtt";
  if (bytes.length >= 188 && bytes[0] === 0x47 && (bytes.length < 376 || bytes[188] === 0x47))
    return "mpegts";
  return null;
}

export function assertMediaMatchesExtension(
  bytes: Uint8Array,
  filename: string,
): VerifiedMediaKind {
  const kind = detectMediaKind(bytes);
  const extension = filename.toLowerCase().split(".").pop();
  const allowed: Record<string, VerifiedMediaKind[]> = {
    mp4: ["mp4"],
    mov: ["quicktime", "mp4"],
    mkv: ["matroska"],
    webm: ["webm"],
    m3u8: ["hls"],
    ts: ["mpegts"],
    vtt: ["vtt"],
    m4s: ["mp4"],
  };
  if (!kind || !extension || !allowed[extension]?.includes(kind)) {
    throw new ApiError(
      415,
      "MEDIA_CONTENT_MISMATCH",
      "The uploaded file content does not match its file type.",
    );
  }
  return kind;
}

export function isAllowedHlsOutputPath(relativePath: string): boolean {
  if (!isSafeStoragePath(relativePath) || relativePath.length > 220) return false;
  const name = relativePath.split("/").pop()?.toLowerCase() ?? "";
  return (
    /^(?:master|index|variant(?:_[a-z0-9_-]+)?)\.m3u8$/.test(name) ||
    /^segment_[0-9]{5}\.(?:ts|m4s)$/.test(name) ||
    name === "init.mp4" ||
    /^subtitle_[a-z0-9_-]+\.vtt$/.test(name) ||
    /^(?:encryption|stream)_[a-z0-9_-]+\.(?:key|keyinfo)$/.test(name)
  );
}
