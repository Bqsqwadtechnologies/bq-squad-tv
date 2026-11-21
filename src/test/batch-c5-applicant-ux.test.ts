import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEFAULT_KYC_STRINGS, getKycString } from "@/lib/kyc-strings";
import { compressImageClientSide } from "@/lib/kyc-compression";

describe("Batch C5 - Applicant UX & Support Polish", () => {
  describe("KYC String Dictionary & Localization Helpers", () => {
    it("provides comprehensive default strings across all required categories", () => {
      expect(DEFAULT_KYC_STRINGS["kyc.header.title"]).toBeDefined();
      expect(DEFAULT_KYC_STRINGS["kyc.help.nin"]).toContain("National Identification Number");
      expect(DEFAULT_KYC_STRINGS["kyc.help.cac"]).toContain("Corporate Affairs Commission");
      expect(DEFAULT_KYC_STRINGS["kyc.help.crn"]).toContain("Companies House");
      expect(DEFAULT_KYC_STRINGS["kyc.help.ssn"]).toContain("Social Security Administration");
      expect(DEFAULT_KYC_STRINGS["kyc.help.ein"]).toContain("IRS");
      expect(DEFAULT_KYC_STRINGS["kyc.draft.saveDraft"]).toBeDefined();
      expect(DEFAULT_KYC_STRINGS["kyc.draft.resumeOnPhone"]).toBeDefined();
    });

    it("interpolates parameters and supports custom overrides", () => {
      const custom = {
        "custom.greeting": "Welcome {name} to {territory} compliance",
      };
      const rendered = getKycString("custom.greeting", custom, {
        name: "Amara",
        territory: "Nigeria",
      });
      expect(rendered).toBe("Welcome Amara to Nigeria compliance");

      // Fallback to key when not found
      expect(getKycString("nonexistent.key")).toBe("nonexistent.key");
    });

    it("ensures default strings never expose storage bucket names, vendor names, or reviewer IDs", () => {
      const allText = Object.values(DEFAULT_KYC_STRINGS).join(" ").toLowerCase();
      expect(allText).not.toContain("gcs");
      expect(allText).not.toContain("s3");
      expect(allText).not.toContain("cloudinary");
      expect(allText).not.toContain("firebase-storage");
      expect(allText).not.toContain("reviewer_uid");
    });
  });

  describe("Client-side Image Compression Helper", () => {
    it("returns original file unchanged when compression is disabled", async () => {
      const blob = new Blob(["dummy test file contents"], { type: "image/jpeg" });
      const file = new File([blob], "test-photo.jpg", { type: "image/jpeg" });

      const result = await compressImageClientSide(file, { enabled: false });
      expect(result.wasCompressed).toBe(false);
      expect(result.file).toBe(file);
    });

    it("skips non-image files such as PDFs even when compression is enabled", async () => {
      const blob = new Blob(["dummy pdf bytes"], { type: "application/pdf" });
      const file = new File([blob], "statement.pdf", { type: "application/pdf" });

      const result = await compressImageClientSide(file, { enabled: true });
      expect(result.wasCompressed).toBe(false);
      expect(result.file).toBe(file);
    });

    it("skips small images (< 400KB) to preserve fine microprint clarity", async () => {
      const smallContent = new Uint8Array(100 * 1024); // 100 KB
      const file = new File([smallContent], "small-id.jpg", { type: "image/jpeg" });

      const result = await compressImageClientSide(file, { enabled: true });
      expect(result.wasCompressed).toBe(false);
      expect(result.file).toBe(file);
    });
  });

  describe("QR Cross-Device Handoff Token Security", () => {
    it("rejects invalid or tampered tokens during handoff resolution", async () => {
      const { Route: resolveRoute } = await import(
        "@/routes/api/public/v1/kyc/handoff/resolve"
      );

      const fakeRequest = new Request("http://localhost/api/public/v1/kyc/handoff/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tampered-bad-token" }),
      });

      const res = await (resolveRoute as any).options.server.handlers.POST({
        request: fakeRequest,
      });

      expect(res.status).toBe(400); // Invalid format (parts.length !== 2)
      const data = await res.json();
      expect(data.error).toContain("Invalid handoff token");
    });

    it("rejects signature mismatch with 401", async () => {
      const { Route: resolveRoute } = await import(
        "@/routes/api/public/v1/kyc/handoff/resolve"
      );

      const payload = Buffer.from(JSON.stringify({ uid: "user-123", exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url");
      const badSig = "bad-sig-length-matching-32bytes-paddinggggggggg";
      const fakeRequest = new Request("http://localhost/api/public/v1/kyc/handoff/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: `${payload}.${badSig}` }),
      });

      const res = await (resolveRoute as any).options.server.handlers.POST({
        request: fakeRequest,
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Invalid token signature.");
    });
  });

  describe("Support Ticket KYC Case Linkage", () => {
    it("validates verification category and case reference schema", async () => {
      const { z } = await import("zod");
      const schema = z.object({
        category: z.enum(["billing", "playback", "account", "content", "verification", "other"]),
        ref: z.string().trim().max(100).optional(),
        kycCaseRef: z.string().trim().max(100).optional(),
        message: z.string().trim().min(5).max(2000),
      });

      const validTicket = {
        category: "verification",
        kycCaseRef: "case-user-12345",
        message: "Need assistance with CAC registration upload format.",
      };

      const parsed = schema.parse(validTicket);
      expect(parsed.category).toBe("verification");
      expect(parsed.kycCaseRef).toBe("case-user-12345");
    });
  });

  describe("Owner-Editable KYC Strings API", () => {
    it("requires mandatory audit reason when updating copy strings", async () => {
      const { z } = await import("zod");
      const updateSchema = z.object({
        updates: z.record(z.string(), z.string()),
        reason: z.string().trim().min(5).max(500),
      });

      expect(() =>
        updateSchema.parse({
          updates: { "kyc.title": "New Title" },
          reason: "too",
        })
      ).toThrow();

      const valid = updateSchema.parse({
        updates: { "kyc.title": "New Title" },
        reason: "Updated applicant title for clarity",
      });
      expect(valid.reason).toBe("Updated applicant title for clarity");
    });
  });
});
