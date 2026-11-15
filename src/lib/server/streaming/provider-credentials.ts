import { ApiError } from "../firebase-admin";

export type EncryptedProviderCredential = {
  algorithm: "A256GCM";
  keyVersion: string;
  nonce: string;
  ciphertext: string;
};

function decodeKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new ApiError(503, "PROVIDER_CREDENTIAL_ENCRYPTION_NOT_CONFIGURED", "Provider credential encryption is not configured.");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(normalized + "="), char => char.charCodeAt(0));
  if (bytes.length !== 32) throw new ApiError(503, "PROVIDER_CREDENTIAL_ENCRYPTION_NOT_CONFIGURED", "Provider credential keys must be 32 bytes.");
  return bytes;
}

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

function decodeB64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new ApiError(400, "PROVIDER_CREDENTIAL_CIPHERTEXT_INVALID", "The encrypted provider credential is invalid.");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), char => char.charCodeAt(0));
}

function aad(channelId: string, providerId: string, version: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(channelId) || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(providerId) ||
      !/^[A-Za-z0-9._-]{1,40}$/.test(version)) {
    throw new ApiError(400, "PROVIDER_CREDENTIAL_CONTEXT_INVALID", "The provider credential context is invalid.");
  }
  return new TextEncoder().encode("bq-sqwad-tv:provider-credential:" + channelId + ":" + providerId + ":" + version);
}

function getKeyring(): { activeVersion: string; keys: Record<string, string> } {
  const raw = process.env["STREAMING_PROVIDER_CREDENTIALS_KEYS_JSON"] ?? "";
  const activeVersion = process.env["STREAMING_PROVIDER_CREDENTIALS_ACTIVE_KEY_VERSION"] ?? "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const keys: Record<string, string> = {};
    for (const [version, value] of Object.entries(parsed)) {
      if (/^[A-Za-z0-9._-]{1,40}$/.test(version) && typeof value === "string") keys[version] = value;
    }
    if (!activeVersion || !keys[activeVersion]) throw new Error("active key missing");
    return { activeVersion, keys };
  } catch {
    throw new ApiError(503, "PROVIDER_CREDENTIAL_ENCRYPTION_NOT_CONFIGURED", "The provider credential encryption keyring is not configured.");
  }
}

/** Encrypt a provider API key before it is persisted to Firestore. */
export async function encryptProviderCredential(
  credential: string,
  channelId: string,
  providerId: string,
): Promise<EncryptedProviderCredential> {
  if (credential.length < 12 || credential.length > 4096 || /[\r\n\0]/.test(credential)) {
    throw new ApiError(400, "PROVIDER_CREDENTIAL_INVALID", "The provider credential is invalid.");
  }
  const keyring = getKeyring();
  const version = keyring.activeVersion;
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(decodeKey(keyring.keys[version])), { name: "AES-GCM" }, false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce), additionalData: toArrayBuffer(aad(channelId, providerId, version)), tagLength: 128 },
    key,
    toArrayBuffer(new TextEncoder().encode(credential)),
  );
  return { algorithm: "A256GCM", keyVersion: version, nonce: b64url(nonce), ciphertext: b64url(new Uint8Array(ciphertext)) };
}

/** Decrypt only inside a server-side provider adapter; never return this value to a client. */
export async function decryptProviderCredential(
  encrypted: EncryptedProviderCredential,
  channelId: string,
  providerId: string,
): Promise<string> {
  if (encrypted.algorithm !== "A256GCM") throw new ApiError(400, "PROVIDER_CREDENTIAL_ALGORITHM_INVALID", "The provider credential format is invalid.");
  const keyring = getKeyring();
  const encodedKey = keyring.keys[encrypted.keyVersion];
  if (!encodedKey) throw new ApiError(503, "PROVIDER_CREDENTIAL_KEY_VERSION_UNAVAILABLE", "The key needed to decrypt this provider credential is unavailable.");
  try {
    const key = await crypto.subtle.importKey("raw", toArrayBuffer(decodeKey(encodedKey)), { name: "AES-GCM" }, false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(decodeB64url(encrypted.nonce)), additionalData: toArrayBuffer(aad(channelId, providerId, encrypted.keyVersion)), tagLength: 128 },
      key,
      toArrayBuffer(decodeB64url(encrypted.ciphertext)),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new ApiError(500, "PROVIDER_CREDENTIAL_DECRYPTION_FAILED", "The provider credential could not be decrypted.");
  }
}
