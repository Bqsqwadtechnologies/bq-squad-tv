/**
 * Response-redaction layer ensuring secrets, private keys, bearer tokens,
 * and credentials never leak into response bodies, diagnostics, or public logs.
 */

const SENSITIVE_KEY_NAMES = new Set([
  "password",
  "secret",
  "token",
  "private_key",
  "privatekey",
  "client_secret",
  "clientsecret",
  "api_key",
  "apikey",
  "service_account_key",
  "auth_hash_key",
  "encryption_key",
]);

export function redactString(input: string): string {
  if (!input) return "";
  let text = input;

  // Redact PEM format private keys
  text = text.replace(
    /-----BEGIN[ A-Z_-]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z_-]*PRIVATE KEY-----/gi,
    "[REDACTED_PRIVATE_KEY]"
  );

  // Redact Bearer tokens
  text = text.replace(/Bearer\s+[A-Za-z0-9-_=.]+/gi, "Bearer [REDACTED_TOKEN]");

  // Redact JWT tokens
  text = text.replace(
    /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
    "[REDACTED_JWT]"
  );

  // Redact query parameter secrets
  text = text.replace(
    /(?:api_?key|\bkey|secret|token|password|signature|sig)=([^\s&"'>]+)/gi,
    "secret=[REDACTED]"
  );

  return text;
}

export function sanitizePayload<T>(payload: T): T {
  if (payload === null || payload === undefined) return payload;

  if (typeof payload === "string") {
    return redactString(payload) as unknown as T;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayload(item)) as unknown as T;
  }

  if (typeof payload === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEY_NAMES.has(lower) || lower.includes("secret") || lower.includes("private_key")) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizePayload(value);
      }
    }
    return sanitized as unknown as T;
  }

  return payload;
}
