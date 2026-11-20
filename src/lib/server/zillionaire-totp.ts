import crypto from "crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function isTotpEncryptionConfigured(): boolean {
  return (process.env["ZILLIONAIRE_MFA_ENCRYPTION_KEY"] || "").length >= 32;
}

function encryptionKey(): Buffer {
  const raw = process.env["ZILLIONAIRE_MFA_ENCRYPTION_KEY"] || "";
  if (raw.length < 32)
    throw new Error("ZILLIONAIRE_MFA_ENCRYPTION_KEY must contain at least 32 characters.");
  return crypto.createHash("sha256").update(raw).digest();
}
export function generateTotpSecret(bytes = 20): string {
  const data = crypto.randomBytes(bytes);
  let bits = "";
  for (const byte of data) bits += byte.toString(2).padStart(8, "0");
  let result = "";
  for (let i = 0; i < bits.length; i += 5)
    result += BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return result;
}
export function base32Decode(input: string): Buffer {
  let bits = "";
  for (const char of input.toUpperCase().replace(/=+$/, "")) {
    const value = BASE32.indexOf(char);
    if (value < 0) throw new Error("Invalid authenticator secret.");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
export function totpAt(secret: string, timeMs = Date.now()): string {
  const counter = Math.floor(timeMs / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}
export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const candidate = Buffer.from(code);
  for (const drift of [-30_000, 0, 30_000]) {
    const expected = Buffer.from(totpAt(secret, now + drift));
    if (crypto.timingSafeEqual(candidate, expected)) return true;
  }
  return false;
}
export function encryptTotpSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptTotpSecret(value: string): string {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted authenticator secret.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => crypto.randomBytes(8).toString("hex").toUpperCase());
}
export function hashRecoveryCode(code: string): string {
  return crypto
    .createHash("sha256")
    .update(code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
    .digest("hex");
}
