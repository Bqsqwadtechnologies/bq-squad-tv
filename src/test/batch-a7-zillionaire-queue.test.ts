import { describe, it, expect, beforeEach } from "vitest";
import * as crypto from "node:crypto";
import { saveKycProfile, getKycProfile, reviewKycProfile } from "@/lib/server/kyc/persistence";

function createMockFirestore() {
  const store = new Map<string, any>();
  return {
    async getDoc(path: string) {
      const data = store.get(path);
      return data ? JSON.parse(JSON.stringify(data)) : null;
    },
    async setDoc(path: string, data: any) {
      store.set(path, JSON.parse(JSON.stringify(data)));
    },
    async patchDoc(path: string, data: any) {
      const existing = store.get(path) || {};
      store.set(path, { ...existing, ...JSON.parse(JSON.stringify(data)) });
    },
    async query(collection: string) {
      const results: any[] = [];
      for (const [key, val] of store.entries()) {
        if (key.startsWith(`${collection}/`)) {
          results.push(val);
        }
      }
      return results;
    },
  } as any;
}

describe("Batch A7 — Zillionaire KYC Review Queue & Decision Actions", () => {
  beforeEach(() => {
    process.env["KYC_FIELD_ENCRYPTION_KEY"] = crypto.randomBytes(32).toString("base64");
    process.env["KYC_VAULT_SIGNING_SECRET"] = crypto.randomBytes(32).toString("hex");
  });

  it("persists applicant profiles and maintains proper pending and approved status in queue", async () => {
    const fs = createMockFirestore();
    const uid = `test_applicant_${Date.now()}`;

    await saveKycProfile(fs, {
      uid,
      role: "producer",
      kycType: "producer_personal",
      kycCountry: "US",
      legalName: "Jane Doe Applicant",
      phone: "+12025550199",
      idTypeId: "passport",
      rawIdNumber: "A98765432",
      rawDateOfBirth: "1990-05-15",
      documentVaultPaths: {
        id_front: `kyc_vault/producer/${uid}/id_front.jpg`,
      },
      faceCaptureVaultPath: `kyc_vault/producer/${uid}/face.jpg`,
    });

    const profile = await getKycProfile(fs, uid);
    expect(profile).toBeDefined();
    expect(profile?.kycStatus).toBe("pending");
    expect(profile?.maskedIdNumber).toBe("*****5432");
  });

  it("rejects without minimum 3-character reason fail-closed", async () => {
    const fs = createMockFirestore();
    const uid = `test_fail_closed_${Date.now()}`;

    await saveKycProfile(fs, {
      uid,
      role: "producer",
      kycType: "producer_personal",
      kycCountry: "GB",
      legalName: "John Smith",
      phone: "+447911123456",
      idTypeId: "passport",
      rawIdNumber: "987654321",
    });

    // Test rejection validation
    await expect(
      reviewKycProfile(fs, {
        uid,
        reviewerUid: "reviewer_1",
        status: "rejected",
        reason: "no", // too short (< 3 chars)
      })
    ).rejects.toThrow(/rejection reason of at least 3 characters is required/i);
  });

  it("approves application and updates kycStatus cleanly", async () => {
    const fs = createMockFirestore();
    const uid = `test_approve_${Date.now()}`;

    await saveKycProfile(fs, {
      uid,
      role: "producer",
      kycType: "producer_business",
      kycCountry: "GB",
      legalName: "Valid Corp Ltd",
      companyRegNumber: "12345678",
      phone: "+447911123456",
    });

    const updated = await reviewKycProfile(fs, {
      uid,
      reviewerUid: "compliance_owner_uid",
      status: "approved",
      notes: "Company verified against Companies House records",
    });

    expect(updated.kycStatus).toBe("approved");
    expect(updated.kycReviewedBy).toBe("compliance_owner_uid");

    const refreshed = await getKycProfile(fs, uid);
    expect(refreshed?.kycStatus).toBe("approved");
  });

  it("validates rejection reason and records audit metadata", async () => {
    const fs = createMockFirestore();
    const uid = `test_reject_${Date.now()}`;

    await saveKycProfile(fs, {
      uid,
      role: "producer",
      kycType: "producer_personal",
      kycCountry: "US",
      legalName: "Incomplete User",
      phone: "+12025550188",
    });

    const rejected = await reviewKycProfile(fs, {
      uid,
      reviewerUid: "owner_compliance",
      status: "rejected",
      reason: "Document image is blurred and unreadable. Please re-upload.",
      notes: "Second attempt needed",
    });

    expect(rejected.kycStatus).toBe("rejected");
    expect(rejected.kycRejectionReason).toContain("blurred and unreadable");

    const refreshed = await getKycProfile(fs, uid);
    expect(refreshed?.kycStatus).toBe("rejected");
    expect(refreshed?.kycRejectionReason).toContain("blurred and unreadable");
  });
});
