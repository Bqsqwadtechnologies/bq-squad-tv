import errorCatalogue from "../../../content/strings/errors.en.json";

export function generateErrorRef(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let ref = "BQ-";
  for (let i = 0; i < 5; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

const LEAK_PATTERNS = [
  /firestore/i,
  /firebase/i,
  /database/i,
  /permission_denied/i,
  /econnrefused/i,
  /sql/i,
  /stack/i,
  /trace/i,
  /exception/i,
  /driver/i,
  /token/i,
  /secret/i,
  /undefined/i,
  /null/i,
  /backblaze/i,
  /b2/i,
  /brevo/i,
  /paystack/i,
  /cloudflare/i,
  /supabase/i,
  /aws/i,
];

export function getFriendlyErrorMessage(code: string, fallback?: string): string {
  const catalogue = errorCatalogue as Record<string, string>;
  if (catalogue[code]) {
    return catalogue[code];
  }

  if (fallback && typeof fallback === "string") {
    const leaks = LEAK_PATTERNS.some((pattern) => pattern.test(fallback));
    if (!leaks && fallback.length <= 160 && !fallback.includes("\n")) {
      return fallback;
    }
  }

  return catalogue["INTERNAL"] ?? catalogue["GENERIC_ERROR"] ?? "Something went wrong on our end. Please try again shortly.";
}
