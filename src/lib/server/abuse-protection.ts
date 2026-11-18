/**
 * Abuse and bot protection utilities:
 * Disposable email blocker and honeypot validation.
 */

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "trashmail.com",
  "yopmail.com",
  "dispostable.com",
  "sharklasers.com",
  "getairmail.com",
  "throwawaymail.com",
  "fakeinbox.com",
  "maildrop.cc",
]);

export function isDisposableEmail(email: string): boolean {
  if (!email || !email.includes("@")) return false;
  const domain = email.trim().toLowerCase().split("@")[1];
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

export function validateHoneypot(honeypotValue?: string | null): boolean {
  // Honeypot fields must be empty when submitted by legitimate human users
  return !honeypotValue || honeypotValue.trim().length === 0;
}
