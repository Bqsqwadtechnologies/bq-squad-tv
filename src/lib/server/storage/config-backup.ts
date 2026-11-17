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

const FORBIDDEN_BACKUP_FIELD = /credential|service.?role|app.?key|secret|password|private.?key|access.?token|refresh.?token|api.?key|key.?id/i;

function assertNoBackupSecrets(value: unknown, depth = 0): void {
  if (depth > 20) throw new ApiError(400, "STORAGE_BACKUP_INVALID", "The configuration backup contains an unsupported structure.");
  if (Array.isArray(value)) {
    if (value.length > 20_000) throw new ApiError(413, "STORAGE_BACKUP_TOO_LARGE", "The configuration backup is too large.");
    for (const item of value) assertNoBackupSecrets(item, depth + 1);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_BACKUP_FIELD.test(key)) {
      throw new ApiError(400, "STORAGE_BACKUP_SECRET_FIELD", "Private connection details cannot be included in a configuration backup.");
    }
    assertNoBackupSecrets(item, depth + 1);
  }
}

export async function encryptStorageConfigurationBackup(
  data: StorageConfigurationBackup,
  secret: string,
): Promise<string> {
  assertNoBackupSecrets(data);
  const serialized = JSON.stringify(data);
  if (encoder.encode(serialized).byteLength > 10_000_000) {
    throw new ApiError(413, "STORAGE_BACKUP_TOO_LARGE", "The configuration backup is too large.");
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await backupKey(secret);
  const plain = encoder.encode(serialized);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return JSON.stringify({ version: 1, algorithm: "AES-GCM", iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(encrypted)) });
}

export async function decryptStorageConfigurationBackup(
  serialized: string,
  secret: string,
): Promise<StorageConfigurationBackup> {
  try {
    const envelope = JSON.parse(serialized) as Record<string, unknown>;
    if (envelope["version"] !== 1 || envelope["algorithm"] !== "AES-GCM" ||
        typeof envelope["iv"] !== "string" || typeof envelope["ciphertext"] !== "string") {
      throw new Error("invalid envelope");
    }
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
      await backupKey(secret),
      base64ToBytes(envelope.ciphertext),
    );
    const data = JSON.parse(decoder.decode(plain)) as StorageConfigurationBackup;
    assertNoBackupSecrets(data);
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
