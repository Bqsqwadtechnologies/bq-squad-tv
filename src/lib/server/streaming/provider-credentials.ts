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
  if (bytes.length !== 32) throw new ApiError(503, "PROVIDER_CREDENTIAL_ENCRYPTION_NOT_CONFIGURED", "Provider credential encryption key must be 32 bytes.");
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

function aad(channelId: string, providerId: string, version: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(channelId) || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(providerId)) {
    throw new ApiError(400, "PROVIDER_CREDENTIAL_CONTEXT_INVALID", "The provider credential context is invalid.");
  }
  return new TextEncoder().encode("bq-sqwad-tv:provider-credential:" + channelId + ":" + providerId + ":" + version);
}

/** Encrypts a provider API key before it is persisted to Firestore. */
export async function encryptProviderCredential(
  credential: string,
  channelId: string,
  providerId: string,
): Promise<EncryptedProviderCredential> {
  if (credential.length < 12 || credential.length > 4096 || /[\r\n\0]/.test(credential)) {
    throw new ApiError(400, "PROVIDER_CREDENTIAL_INVALID", "The provider credential is invalid.");
  }
  const raw = process.env["STREAMING_PROVIDER_CREDENTIALS_KEY"] ?? "";
  const version = process.env["STREAMING_PROVIDER_CREDENTIALS_KEY_VERSION"] ?? "v1";
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(version)) {
    throw new ApiError(503, "PROVIDER_CREDENTIAL_ENCRYPTION_NOT_CONFIGURED", "The provider credential key version is invalid.");
  }
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(decodeKey(raw)), { name: "AES-GCM" }, false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce), additionalData: toArrayBuffer(aad(channelId, providerId, version)), tagLength: 128 },
    key,
    toArrayBuffer(new TextEncoder().encode(credential)),
  );
  return { algorithm: "A256GCM", keyVersion: version, nonce: b64url(nonce), ciphertext: b64url(new Uint8Array(ciphertext)) };
}
