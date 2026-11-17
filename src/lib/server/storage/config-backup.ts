import { ApiError } from "../firebase-admin";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}
function base64ToBytes(value: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch {
    throw new ApiError(400, "STORAGE_BACKUP_FORMAT_INVALID", "The configuration backup could not be read.");
  }
}
async function backupKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32 || secret.length > 4096) {
    throw new ApiError(503, "STORAGE_BACKUP_KEY_MISSING", "The private backup setting is not configured.");
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export type StorageConfigurationBackup = {
  version: 1;
  createdAt: string;
  destinations: Array<Record<string, unknown>>;
  poolIndex: Array<Record<string, unknown>>;
  assetBindings: Array<Record<string, unknown>>;
  egressLedgers: Array<Record<string, unknown>>;
};

export async function encryptStorageConfigurationBackup(
  data: StorageConfigurationBackup,
  secret: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await backupKey(secret);
  const plain = encoder.encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return JSON.stringify({ version: 1, algorithm: "AES-GCM", iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(encrypted)) });
}

export async function decryptStorageConfigurationBackup(
  serialized: string,
  secret: string,
): Promise<StorageConfigurationBackup> {
  try {
    const envelope = JSON.parse(serialized) as Record<string, unknown>;
    if (envelope.version !== 1 || envelope.algorithm !== "AES-GCM" ||
        typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string") {
      throw new Error("invalid envelope");
    }
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
      await backupKey(secret),
      base64ToBytes(envelope.ciphertext),
    );
    const data = JSON.parse(decoder.decode(plain)) as StorageConfigurationBackup;
    if (data.version !== 1 || !Array.isArray(data.destinations) || !Array.isArray(data.poolIndex) ||
        !Array.isArray(data.assetBindings) || !Array.isArray(data.egressLedgers) ||
        data.destinations.some(item => "credentials" in item || "serviceRoleKey" in item || "appKey" in item || "keyId" in item)) {
      throw new Error("invalid backup payload");
    }
    return data;
  } catch {
    throw new ApiError(400, "STORAGE_BACKUP_INVALID", "The encrypted configuration backup is invalid or its private key does not match.");
  }
}
