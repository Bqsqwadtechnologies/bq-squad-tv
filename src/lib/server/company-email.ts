import { ApiError } from "./firebase-admin";

export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "gmx.com",
  "gmx.net",
]);

export function isFreeEmailDomain(email: string): boolean {
  if (typeof email !== "string") return false;
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[1]) return false;
  return FREE_EMAIL_DOMAINS.has(parts[1]);
}

export function requireCompanyEmail(email: string, roleLabel = "Partner"): string {
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new ApiError(400, "INVALID_EMAIL", "A valid email address is required.");
  }
  if (isFreeEmailDomain(cleanEmail)) {
    throw new ApiError(
      400,
      "COMPANY_EMAIL_REQUIRED",
      `Personal or free-mail providers (Gmail, Yahoo, Outlook, Proton, etc.) are not accepted for ${roleLabel} accounts. Please use your official company domain email.`,
    );
  }
  return cleanEmail;
}
