import { describe, expect, it } from "vitest";
import {
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_TTL_MS,
  equalOtpHashes,
  generateEmailOtp,
  hashEmailOtp,
  normalizeEmail,
  validEmail,
} from "@/lib/server/email/otp";

describe("email OTP security primitives", () => {
  it("generates six-digit codes including leading zeroes", () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const generated = generateEmailOtp();
      expect(generated.code).toMatch(/^\d{6}$/);
      expect(generated.salt).toMatch(/^[a-f0-9]{32}$/);
    }
  });

  it("binds the code hash to the user, purpose and salt", async () => {
    const hash = await hashEmailOtp("uid-1", "verify_email", "salt", "123456");
    expect(equalOtpHashes(hash, await hashEmailOtp("uid-1", "verify_email", "salt", "123456"))).toBe(true);
    expect(equalOtpHashes(hash, await hashEmailOtp("uid-2", "verify_email", "salt", "123456"))).toBe(false);
    expect(equalOtpHashes(hash, await hashEmailOtp("uid-1", "reset_password", "salt", "123456"))).toBe(false);
    expect(equalOtpHashes(hash, await hashEmailOtp("uid-1", "verify_email", "other-salt", "123456"))).toBe(false);
    expect(equalOtpHashes(hash, await hashEmailOtp("uid-1", "verify_email", "salt", "654321"))).toBe(false);
  });

  it("uses bounded expiry and attempt limits", () => {
    expect(EMAIL_OTP_TTL_MS).toBe(10 * 60 * 1000);
    expect(EMAIL_OTP_MAX_ATTEMPTS).toBe(5);
  });

  it("normalizes and validates email addresses", () => {
    expect(normalizeEmail("  Isaac@Example.com ")).toBe("isaac@example.com");
    expect(validEmail("isaac@example.com")).toBe(true);
    expect(validEmail("not-an-email")).toBe(false);
  });
});
