import { ApiError } from "../firebase-admin";

const BREVO_EMAIL_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SENDER_EMAIL = "verification@bqsqwad.com";
const DEFAULT_SENDER_NAME = "BQ SQWAD TV";

export type VerificationEmailInput = {
  to: string;
  code: string;
  purpose: "verify_email" | "reset_password";
  expiresInMinutes?: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Email delivery is not configured.");
  }
  return value;
}

/**
 * Sends a short-lived verification or password-recovery code using Brevo.
 * Callers must generate, hash, persist, expire and rate-limit codes separately.
 */
export async function sendVerificationCodeEmail(input: VerificationEmailInput): Promise<void> {
  const to = input.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new ApiError(400, "INVALID_EMAIL", "A valid email address is required.");
  }
  if (!/^\d{6}$/.test(input.code)) {
    throw new ApiError(400, "INVALID_CODE", "Verification code must contain six digits.");
  }

  const apiKey = requiredEnv("BREVO_API_KEY");
  const senderEmail = (process.env["BREVO_SENDER_EMAIL"] ?? DEFAULT_SENDER_EMAIL).trim();
  const senderName = (process.env["BREVO_SENDER_NAME"] ?? DEFAULT_SENDER_NAME).trim();
  const expiresInMinutes = input.expiresInMinutes ?? 10;
  if (!Number.isInteger(expiresInMinutes) || expiresInMinutes < 1 || expiresInMinutes > 30) {
    throw new ApiError(500, "EMAIL_TEMPLATE_INVALID", "Email expiry configuration is invalid.");
  }

  const isReset = input.purpose === "reset_password";
  const purposeText = isReset ? "password reset" : "email verification";
  const subject = isReset ? "Your BQ SQWAD TV password reset code" : "Verify your BQ SQWAD TV email";
  const safeCode = escapeHtml(input.code);
  const textContent =
    `Your BQ SQWAD TV ${purposeText} code is ${input.code}. It expires in ${expiresInMinutes} minutes. If you did not request this, you can ignore this email.`;
  const htmlContent = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#142033"><h2>BQ SQWAD TV</h2><p>Use this code for ${purposeText}:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${safeCode}</p><p>This code expires in ${expiresInMinutes} minutes and can only be used once.</p><p>If you did not request this, you can ignore this email.</p></body></html>`;

  let response: Response;
  try {
    response = await fetch(BREVO_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        textContent,
        htmlContent,
      }),
    });
  } catch {
    throw new ApiError(502, "EMAIL_DELIVERY_FAILED", "Could not connect to the email delivery service.");
  }

  if (!response.ok) {
    // Do not expose provider response bodies or credentials to clients or logs.
    throw new ApiError(
      response.status === 401 || response.status === 403 ? 503 : 502,
      "EMAIL_DELIVERY_FAILED",
      "The verification email could not be delivered. Please try again later.",
    );
  }
}
