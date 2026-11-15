export const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;

function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateEmailOtp(): { code: string; salt: string } {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return {
    code: String(value % 1_000_000).padStart(6, "0"),
    salt: randomHex(16),
  };
}

export async function hashEmailOtp(
  uid: string,
  purpose: "verify_email" | "reset_password",
  salt: string,
  code: string,
): Promise<string> {
  const pepper = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (!pepper) throw new Error("Email verification hashing is not configured.");
  const pepperDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pepper));
  const key = await crypto.subtle.importKey(
    "raw",
    pepperDigest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const input = new TextEncoder().encode(`${uid}:${purpose}:${salt}:${code}`);
  const digest = await crypto.subtle.sign("HMAC", key, input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function equalOtpHashes(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function hashEmailAddress(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeEmail(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
