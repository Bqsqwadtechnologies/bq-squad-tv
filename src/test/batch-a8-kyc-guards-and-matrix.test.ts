import { describe, it, expect } from "vitest";
import { requireApprovedKyc } from "@/lib/server/access";
import { ALL_COUNTRIES, getCountryRule, fuzzyNameMatch } from "@/lib/kyc-country-rules";
import { generateShortLivedViewerUrl, verifyViewerUrlSignature } from "@/lib/server/kyc/storage";

function createMockFirestore(profiles: Record<string, any> = {}) {
  const store = new Map<string, any>(Object.entries(profiles));
  return {
    async getDoc(path: string) {
      const data = store.get(path);
      return data ? JSON.parse(JSON.stringify(data)) : null;
    },
    async setDoc(path: string, data: any) {
      store.set(path, JSON.parse(JSON.stringify(data)));
    },
  } as any;
}

describe("Batch A8 — KYC Guards, Country Matrix & End-to-End Checklist", () => {
  describe("KYC Approval Guard (requireApprovedKyc)", () => {
    it("throws 403 KYC_NOT_APPROVED when KYC is unsubmitted", async () => {
      const fs = createMockFirestore({});
      try {
        await requireApprovedKyc(fs, "user_unsubmitted", "producer");
        expect.unreachable("Should have thrown 403");
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe("KYC_NOT_APPROVED");
        expect(err.message).toContain("unsubmitted");
      }
    });

    it("throws 403 KYC_NOT_APPROVED when KYC is pending review", async () => {
      const fs = createMockFirestore({
        "kycProfiles/user_pending": { uid: "user_pending", kycStatus: "pending" },
      });
      try {
        await requireApprovedKyc(fs, "user_pending", "producer");
        expect.unreachable("Should have thrown 403");
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe("KYC_NOT_APPROVED");
        expect(err.message).toContain("pending");
      }
    });

    it("throws 403 KYC_NOT_APPROVED when KYC is rejected or needs changes", async () => {
      const fs = createMockFirestore({
        "kycProfiles/user_rejected": { uid: "user_rejected", kycStatus: "rejected" },
        "kycProfiles/user_changes": { uid: "user_changes", kycStatus: "needs_changes" },
      });
      try {
        await requireApprovedKyc(fs, "user_rejected", "producer");
        expect.unreachable("Should have thrown 403");
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe("KYC_NOT_APPROVED");
      }

      try {
        await requireApprovedKyc(fs, "user_changes", "producer");
        expect.unreachable("Should have thrown 403");
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe("KYC_NOT_APPROVED");
      }
    });

    it("passes cleanly when KYC profile status is approved", async () => {
      const fs = createMockFirestore({
        "kycProfiles/user_approved": { uid: "user_approved", kycStatus: "approved" },
      });
      await expect(requireApprovedKyc(fs, "user_approved", "producer")).resolves.toBeUndefined();
    });
  });

  describe("Country Matrix 193-Country Coverage & Fallbacks", () => {
    it("ensures every country in ALL_COUNTRIES resolves to a valid rule", () => {
      expect(ALL_COUNTRIES.length).toBeGreaterThanOrEqual(193);

      for (const country of ALL_COUNTRIES) {
        const rule = getCountryRule(country.code);
        expect(rule).toBeDefined();
        expect(rule.code).toBe(country.code);
        expect(rule.name).toBe(country.name);
        expect(rule.dialCode).toMatch(/^\+\d+/);
        expect(rule.acceptedPersonalIdTypes.length).toBeGreaterThan(0);
        expect(rule.companyRegistry).toBeDefined();
        expect(rule.taxId).toBeDefined();
      }
    });

    it("safely falls back to generic country rule for unknown codes", () => {
      const generic = getCountryRule("ZZ" as any);
      expect(generic).toBeDefined();
      expect(generic.isGeneric).toBe(true);
      expect(generic.acceptedPersonalIdTypes.length).toBeGreaterThan(0);
    });
  });

  describe("Name Matching & Anti-Fraud Flags", () => {
    it("flags name mismatches between KYC legal name and bank beneficiary", () => {
      const match1 = fuzzyNameMatch("Aliko Dangote", "Aliko Dangote");
      expect(match1.matches).toBe(true);
      expect(match1.score).toBe(1.0);

      const mismatch = fuzzyNameMatch("David Adeleke", "Wizkid Balogun");
      expect(mismatch.matches).toBe(false);
      expect(mismatch.score).toBeLessThan(0.4);
    });
  });

  describe("Document Vault Protection & Signature Verification", () => {
    it("denies access to signed URLs with invalid or tampered signatures and verifies authentic ones", () => {
      process.env["KYC_VAULT_SIGNING_SECRET"] = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const validPath = "kyc_vault/producer/u1/id.jpg";
      const reviewer = "owner_1";

      const signed = generateShortLivedViewerUrl(validPath, reviewer);
      expect(signed.signedUrl).toContain("sig=");

      const urlObj = new URL("http://localhost" + signed.signedUrl);
      const exp = Number(urlObj.searchParams.get("exp"));
      const sig = urlObj.searchParams.get("sig")!;

      // Authentic verification
      expect(verifyViewerUrlSignature(validPath, reviewer, exp, sig)).toBe(true);

      // Tampered path
      expect(verifyViewerUrlSignature("kyc_vault/another_user/doc.jpg", reviewer, exp, sig)).toBe(false);

      // Tampered reviewer
      expect(verifyViewerUrlSignature(validPath, "different_reviewer", exp, sig)).toBe(false);

      // Tampered signature
      expect(verifyViewerUrlSignature(validPath, reviewer, exp, "bad_hex_sig_0000000000000000000000000000000000000000000000000000000000000000")).toBe(false);
    });
  });
});
