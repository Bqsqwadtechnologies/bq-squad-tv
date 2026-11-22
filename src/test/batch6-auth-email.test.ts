import { describe, it, expect, vi } from "vitest";
import { SECRET_CATALOG } from "@/routes/api/public/v1/zillionaire/secret-health";
import { sendTestEmail } from "@/lib/server/email/brevo";

describe("Batch 6: Auth, Google Sign-In and Email Delivery", () => {
  it("includes BREVO email secrets in the secret catalog with descriptions and rotation recommendations", () => {
    const brevoKey = SECRET_CATALOG.find((s) => s.name === "BREVO_API_KEY");
    expect(brevoKey).toBeDefined();
    expect(brevoKey?.category).toBe("Infrastructure & Compute");

    const brevoSenderEmail = SECRET_CATALOG.find((s) => s.name === "BREVO_SENDER_EMAIL");
    expect(brevoSenderEmail).toBeDefined();
    expect(brevoSenderEmail?.description).toContain("default: tv@bqsqwad.com");

    const brevoSenderName = SECRET_CATALOG.find((s) => s.name === "BREVO_SENDER_NAME");
    expect(brevoSenderName).toBeDefined();
    expect(brevoSenderName?.description).toContain("default: BQ SQWAD TV");
  });

  it("validates recipient email in sendTestEmail before attempting delivery", async () => {
    await expect(sendTestEmail("invalid-email")).rejects.toThrow();
  });

  it("sendTestEmail successfully sends via Brevo endpoint when API key is present", async () => {
    process.env.BREVO_API_KEY = "xkeysib-test-mock-key";
    process.env.BREVO_SENDER_EMAIL = "tv@bqsqwad.com";
    process.env.BREVO_SENDER_NAME = "BQ SQWAD TV";

    const originalFetch = global.fetch;
    try {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messageId: "<test-msg-123@brevo.com>" }),
      } as any);

      const result = await sendTestEmail("owner@bqsqwad.com");
      expect(result.success).toBe(true);
      expect(result.messageId).toBe("<test-msg-123@brevo.com>");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.brevo.com/v3/smtp/email",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "api-key": "xkeysib-test-mock-key" }),
        })
      );
    } finally {
      global.fetch = originalFetch;
      delete process.env.BREVO_API_KEY;
    }
  });
});
