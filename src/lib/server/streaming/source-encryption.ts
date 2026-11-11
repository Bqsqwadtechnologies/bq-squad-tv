import { ApiError } from "../firebase-admin";

export type EncryptedStreamingSource = {
  algorithm: "A256GCM";
  keyVersion: string;
  nonce: string;
  ciphertext: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ApiError(503, "STREAMING_ENCRYPTION_NOT_CONFIGURED", "The streaming encryption key is invalid.");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function validateSourceUrl(value: string): string {
  if (value.length > 8192) {
    throw new ApiError(400, "INVALID_STREAM_SOURCE", "The streaming source URL is too long.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiError(400, "INVALID_STREAM_SOURCE", "A valid HTTPS streaming source URL is required.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new ApiError(400, "INVALID_STREAM_SOURCE", "Only HTTPS source URLs without embedded credentials are accepted.");
  }
  return parsed.toString();
}

async function importAesKey(keyBase64Url: string): Promise<CryptoKey> {
  const raw = decodeBase64Url(keyBase64Url);
  if (raw.length !== 32) {
    throw new ApiError(503, "STREAMING_ENCRYPTION_NOT_CONFIGURED", "The streaming encryption key must contain 32 bytes.");
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function associatedData(contentAssetId: string, keyVersion: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(contentAssetId) || !/^[A-Za-z0-9._-]{1,40}$/.test(keyVersion)) {
    throw new ApiError(400, "INVALID_STREAM_SOURCE", "The content asset or key version is invalid.");
  }
  return encoder.encode(`bq-sqwad-tv:stream-source:${contentAssetId}:${keyVersion}`);
}

/**
 * Encrypts a source URL with AES-256-GCM. The key is passed in from the
 * server-only secret reader; never pass a key from a browser or Android client.
 */
export async function encryptStreamingSourceUrl(
  sourceUrl: string,
  contentAssetId: string,
  keyVersion: string,
  keyBase64Url: string,
): Promise<EncryptedStreamingSource> {
  const normalizedUrl = validateSourceUrl(sourceUrl);
  const key = await importAesKey(keyBase64Url);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: associatedData(contentAssetId, keyVersion), tagLength: 128 },
    key,
    encoder.encode(normalizedUrl),
  );
  return {
    algorithm: "A256GCM",
    keyVersion,
    nonce: encodeBase64Url(nonce),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
  };
}

/**
 * Decryption is a server-only primitive. Call it only from a separately
 * authorized playback or audited administrator action; never from producer
 * read/list endpoints.
 */
export async function decryptStreamingSourceUrl(
  envelope: EncryptedStreamingSource,
  contentAssetId: string,
  keyBase64Url: string,
): Promise<string> {
  if (envelope.algorithm !== "A256GCM") {
    throw new ApiError(400, "STREAM_SOURCE_FORMAT_INVALID", "The encrypted source format is not supported.");
  }
  const key = await importAesKey(keyBase64Url);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decodeBase64Url(envelope.nonce),
        additionalData: associatedData(contentAssetId, envelope.keyVersion),
        tagLength: 128,
      },
      key,
      decodeBase64Url(envelope.ciphertext),
    );
    return validateSourceUrl(decoder.decode(plaintext));
  } catch {
    throw new ApiError(500, "STREAM_SOURCE_DECRYPT_FAILED", "The protected streaming source could not be decrypted.");
  }
}

/** Reads the versioned key ring from Lovable Cloud Secrets at request time. */
export function getStreamingSourceKey(keyVersion?: string): { keyVersion: string; keyBase64Url: string } {
  const rawKeyRing = process.env["STREAMING_URL_ENCRYPTION_KEYS_JSON"];
  const activeVersion = process.env["STREAMING_URL_ACTIVE_KEY_VERSION"];
  if (!rawKeyRing || !activeVersion) {
    throw new ApiError(503, "STREAMING_ENCRYPTION_NOT_CONFIGURED", "Streaming source encryption is not configured.");
  }
  let keyRing: Record<string, unknown>;
  try {
    keyRing = JSON.parse(rawKeyRing) as Record<string, unknown>;
  } catch {
    throw new ApiError(503, "STREAMING_ENCRYPTION_NOT_CONFIGURED", "Streaming source encryption configuration is invalid.");
  }
  const version = keyVersion ?? activeVersion;
  const key = keyRing[version];
  if (typeof key !== "string") {
    throw new ApiError(503, "STREAMING_ENCRYPTION_KEY_UNAVAILABLE", "The required streaming encryption key version is unavailable.");
  }
  return { keyVersion: version, keyBase64Url: key };
}
