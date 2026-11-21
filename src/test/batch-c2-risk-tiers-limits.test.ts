import * as apiModule from "@/lib/server/api";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateKycRiskScore, calculateNameMismatchRatio } from "@/lib/server/kyc/risk-scoring";
import { getKycRiskSettings, updateKycRiskSettings, DEFAULT_KYC_RISK_SETTINGS } from "@/lib/server/kyc/risk-settings";

const mockDb: Map<string, any> = ((globalThis as any).__sharedTestFirestore ??= new Map<string, any>());

vi.mock("@/lib/server/firebase-admin", () => {
  return {
    ApiError: class ApiError extends Error {
      status: number;
      code: string;
      constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
      }
    },
    encodeFields: (obj: any) => obj,
    Firestore: {
      create: vi.fn(async () => ({
        docName: (p: string) => p,
        getDoc: vi.fn(async (path: string) => mockDb.get(path) || null),
        setDoc: vi.fn(async (path: string, data: any) => {
          mockDb.set(path, { ...data });
        }),
        patchDoc: vi.fn(async (path: string, data: any) => {
          const current = mockDb.get(path) || {};
          mockDb.set(path, { ...current, ...data });
        }),
        query: vi.fn(async (col: string, options?: any) => {
          const results: any[] = [];
          for (const [key, val] of mockDb.entries()) {
            if (key.startsWith(`${col}/`)) {
              results.push({ __id: key.slice(col.length + 1), ...val });
            }
          }
          return results;
        }),
        transact: vi.fn(async (paths: string[], fn: (docs: any[]) => any) => {
          const docs = paths.map((p) => mockDb.get(p) || null);
          const res = await fn(docs);
          const writes = res?.writes || [];
          for (const w of writes) {
            if (w.update) {
              const name = w.update.name;
              const fields = w.update.fields || {};
              mockDb.set(name, { ...(mockDb.get(name) || {}), ...fields });
            }
          }
          return res?.result;
        }),
        commit: vi.fn(async (writes: any[]) => {
          for (const w of writes) {
            if (w.update) {
              const name = w.update.name;
              const fields = w.update.fields || {};
              mockDb.set(name, { ...(mockDb.get(name) || {}), ...fields });
            }
          }
        }),
      })),
    },
  };
});

vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: vi.fn(async (_fs: any, input: any) => {
    const id = "mock_audit_" + Math.random().toString(36).substring(2, 9);
    mockDb.set("auditLog/" + id, { ...input, createdAt: new Date().toISOString() });
    return id;
  }),
}));

vi.mock("@/lib/server/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => true),
}));

describe("Batch C2 — Risk Tiers, Velocity Limits, and Four-Eyes Dual Approval", () => {
  beforeEach(() => {
    mockDb.clear();
    process.env["KYC_VAULT_SIGNING_SECRET"] = "super-secret-vault-signing-key-32-bytes-minimum-length!";
    process.env["KYC_FIELD_ENCRYPTION_KEY"] = Buffer.alloc(32, 9).toString("base64");
    process.env["ZILLIONAIRE_EMAIL"] = "owner@bqsqwad.tv";

    vi.spyOn(apiModule, "requireUser").mockImplementation(async (req: Request) => {
      const testUid = req.headers.get("x-test-user-id") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!testUid) {
        const { ApiError } = await import("@/lib/server/firebase-admin");
        throw new ApiError(401, "UNAUTHENTICATED", "Sign-in token required.");
      }
      return {
        uid: testUid,
        email: `${testUid}@test.com`,
        emailVerified: true,
        customClaims: {},
      } as any;
    });
  });

  describe("1. Automated Risk Scoring Engine", () => {
    it("assigns low risk and requiresFourEyes=false for standard low-risk country without anomalies", () => {
      const result = calculateKycRiskScore({
        applicantUid: "user_low_risk",
        country: "GB",
        applicantName: "Adekunle Gold",
        payoutAccountName: "Adekunle Gold",
      });

      expect(result.riskScore).toBeLessThan(40);
      expect(result.riskLevel).toBe("low");
      expect(result.requiresFourEyes).toBe(false);
      expect(result.factors.length).toBe(0);
    });

    it("elevates score to high risk and mandates four-eyes for FATF high-risk jurisdictions", () => {
      const result = calculateKycRiskScore({
        applicantUid: "user_sanction_risk",
        country: "KP", // North Korea
        applicantName: "Kim Test",
      });

      expect(result.riskScore).toBeGreaterThanOrEqual(50);
      expect(result.factors.some((f) => f.code === "COUNTRY_FATF_HIGH_RISK")).toBe(true);
    });

    it("elevates risk score to high and requires four-eyes when duplicates and name mismatch are detected", () => {
      const result = calculateKycRiskScore({
        applicantUid: "user_fraud_suspect",
        country: "NG",
        applicantName: "John Doe",
        payoutAccountName: "Totally Different Name LLC",
        duplicateIdFound: true,
        duplicateBankFound: true,
      });

      expect(result.riskScore).toBeGreaterThanOrEqual(70);
      expect(result.riskLevel).toBe("high");
      expect(result.requiresFourEyes).toBe(true);
      expect(result.factors.some((f) => f.code === "DUPLICATE_ID_NUMBER")).toBe(true);
      expect(result.factors.some((f) => f.code === "DUPLICATE_BANK_ACCOUNT")).toBe(true);
      expect(result.factors.some((f) => f.code === "BENEFICIARY_NAME_MISMATCH")).toBe(true);
    });
  });

  describe("2. Owner-Editable Risk Settings and Tier Thresholds (Audited)", () => {
    it("returns default thresholds when unconfigured", async () => {
      const { Firestore } = await import("@/lib/server/firebase-admin");
      const fs = await Firestore.create();
      const settings = await getKycRiskSettings(fs as any);

      expect(settings.tier1CumulativeLimitUsdMinor).toBe(1_000_000); // $10,000
      expect(settings.tier1CumulativeLimitNgnMinor).toBe(1_500_000_000); // ₦15,000,000
      expect(settings.highRiskThresholdScore).toBe(70);
      expect(settings.fourEyesRequiredForHighRisk).toBe(true);
    });

    it("updates risk settings with mandatory owner reason and records audit entry", async () => {
      const { Firestore } = await import("@/lib/server/firebase-admin");
      const fs = await Firestore.create();

      const updated = await updateKycRiskSettings(
        fs as any,
        {
          tier1CumulativeLimitUsdMinor: 2_000_000, // $20,000
          highRiskThresholdScore: 65,
        },
        { uid: "owner_1", email: "owner@bqsqwad.tv" },
        "Increasing Tier 1 limit for approved holiday creator surge",
      );

      expect(updated.tier1CumulativeLimitUsdMinor).toBe(2_000_000);
      expect(updated.highRiskThresholdScore).toBe(65);

      // Verify audit was recorded
      const audits = Array.from(mockDb.entries()).filter(
        ([k, v]) => k.startsWith("auditLog/") && v.action === "kyc.risk_settings.updated",
      );
      expect(audits.length).toBeGreaterThan(0);
      expect(audits[0][1].reason).toContain("holiday creator surge");
    });

    it("rejects update when reason is missing or too short", async () => {
      const { Firestore } = await import("@/lib/server/firebase-admin");
      const fs = await Firestore.create();

      await expect(
        updateKycRiskSettings(
          fs as any,
          { highRiskThresholdScore: 60 },
          { uid: "owner_1" },
          "no",
        ),
      ).rejects.toThrow(/reason/i);
    });
  });

  describe("3. Payout Request Tier Limits Enforcement", () => {
    it("Tier 1 applicant cannot exceed cumulative threshold without Tier 2 enhanced verification", async () => {
      const { Route: PayoutRequestRoute } = await import(
        "@/routes/api/public/v1/producer/payouts/request"
      );

      // Set up approved KYC profile at Tier 1
      mockDb.set("users/prod_tier1", {
        uid: "prod_tier1",
        email: "producer@test.com",
        emailVerified: true,
        roleTags: ["producer"],
      });
      mockDb.set("producers/prod_tier1", {
        uid: "prod_tier1",
        planStatus: "ACTIVE",
        verificationStatus: "APPROVED",
        payoutTier: 1,
        earningsBalanceByCurrency: { USD: 2_500_000 },
      });
      mockDb.set("kycProfiles/prod_tier1", {
        uid: "prod_tier1",
        kycStatus: "approved",
        payoutTier: 1,
      });
      mockDb.set("payoutProfiles/prod_tier1", {
        uid: "prod_tier1",
        status: "APPROVED",
        beneficiaryName: "Producer One",
        accountNumberMasked: "****1234",
      });

      // Attempt payout of $15,000 (1,500,000 cents) which exceeds Tier 1 limit ($10,000)
      const req = new Request("http://localhost/api/public/v1/producer/payouts/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "prod_tier1",
        },
        body: JSON.stringify({
          amountMinor: 1_500_000, // $15,000
          currency: "USD",
          idempotencyKey: "11111111-2222-3333-4444-555555555555",
        }),
      });

      const res = await PayoutRequestRoute.options.server!.handlers!.POST!({ request: req } as any);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("TIER_LIMIT_EXCEEDED");
      expect(json.message).toContain("Tier 2 Enhanced KYC");
    });

    it("Tier 2 enhanced verified applicant can request payouts above Tier 1 limit", async () => {
      const { Route: PayoutRequestRoute } = await import(
        "@/routes/api/public/v1/producer/payouts/request"
      );

      // Set up Tier 2 approved profile
      mockDb.set("users/prod_tier2", {
        uid: "prod_tier2",
        email: "producer2@test.com",
        emailVerified: true,
        roleTags: ["producer"],
      });
      mockDb.set("producers/prod_tier2", {
        uid: "prod_tier2",
        planStatus: "ACTIVE",
        verificationStatus: "APPROVED",
        payoutTier: 2,
        earningsBalanceByCurrency: { USD: 2_500_000 },
      });
      mockDb.set("kycProfiles/prod_tier2", {
        uid: "prod_tier2",
        kycStatus: "approved",
        payoutTier: 2,
      });
      mockDb.set("payoutProfiles/prod_tier2", {
        uid: "prod_tier2",
        status: "APPROVED",
        beneficiaryName: "Producer Tier 2",
        accountNumberMasked: "****5678",
      });

      // Request $15,000
      const req = new Request("http://localhost/api/public/v1/producer/payouts/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "prod_tier2",
        },
        body: JSON.stringify({
          amountMinor: 1_500_000,
          currency: "USD",
          idempotencyKey: "22222222-3333-4444-5555-666666666666",
        }),
      });

      const res = await PayoutRequestRoute.options.server!.handlers!.POST!({ request: req } as any);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.status).toBe("REQUESTED");
      expect(json.amountMinor).toBe(1_500_000);
    });
  });

  describe("4. Four-Eyes Dual Reviewer Enforcement on High-Risk Cases", () => {
    it("requires two different reviewers to approve a high-risk KYC submission", async () => {
      const { Route: KycDetailRoute } = await import(
        "@/routes/api/public/v1/zillionaire/kyc/detail"
      );

      // Set up high-risk applicant
      mockDb.set("users/applicant_high_risk", {
        uid: "applicant_high_risk",
        email: "applicant@highrisk.com",
      });
      mockDb.set("kycProfiles/applicant_high_risk", {
        uid: "applicant_high_risk",
        role: "producer",
        kycStatus: "pending",
        kycVersion: 1,
        riskScore: 85,
        riskLevel: "high",
        requiresFourEyes: true,
        kycHistory: [],
      });

      // Setup Reviewer 1
      mockDb.set("users/reviewer_1", {
        uid: "reviewer_1",
        email: "rev1@bqsqwad.tv",
        emailVerified: true,
        zillionaireModules: ["compliance"],
      });

      // Reviewer 1 approves: should record partial approval and NOT finalize status to approved
      const req1 = new Request("http://localhost/api/public/v1/zillionaire/kyc/detail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "reviewer_1",
        },
        body: JSON.stringify({
          uid: "applicant_high_risk",
          action: "approve",
          notes: "First review checks out: verified ID document legitimacy",
        }),
      });

      const res1 = await (KycDetailRoute.options.server!.handlers as any).POST({ request: req1 } as any);
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.partialApproval).toBe(true);
      expect(json1.requiresFourEyes).toBe(true);

      // Profile should have firstReviewer recorded but status remains pending
      const profileAfterFirst = mockDb.get("kycProfiles/applicant_high_risk");
      expect(profileAfterFirst.firstReviewerUid).toBe("reviewer_1");
      expect(profileAfterFirst.kycStatus).toBe("pending");

      // Reviewer 1 tries to approve again -> blocked by four-eyes policy
      const req2 = new Request("http://localhost/api/public/v1/zillionaire/kyc/detail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "reviewer_1",
        },
        body: JSON.stringify({
          uid: "applicant_high_risk",
          action: "approve",
        }),
      });

      const res2 = await (KycDetailRoute.options.server!.handlers as any).POST({ request: req2 } as any);
      expect(res2.status).toBe(400);
      const json2 = await res2.json();
      expect(json2.code).toBe("FOUR_EYES_DIFFERENT_REVIEWER");

      // Setup Reviewer 2 (different person)
      mockDb.set("users/reviewer_2", {
        uid: "reviewer_2",
        email: "rev2@bqsqwad.tv",
        emailVerified: true,
        zillionaireModules: ["compliance"],
      });

      // Reviewer 2 approves -> finalizes approval
      const req3 = new Request("http://localhost/api/public/v1/zillionaire/kyc/detail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "reviewer_2",
        },
        body: JSON.stringify({
          uid: "applicant_high_risk",
          action: "approve",
          notes: "Second reviewer confirms facial match and clear PEP screen",
        }),
      });

      const res3 = await (KycDetailRoute.options.server!.handlers as any).POST({ request: req3 } as any);
      expect(res3.status).toBe(200);

      const finalProfile = mockDb.get("kycProfiles/applicant_high_risk");
      expect(finalProfile.kycStatus).toBe("approved");
      expect(finalProfile.payoutTier).toBe(1);
      expect(finalProfile.secondReviewerUid).toBe("reviewer_2");
    });
  });

  describe("5. Tier 2 Enhanced KYC Submission", () => {
    it("allows approved Tier 1 producer to submit Tier 2 proof of address and source of income", async () => {
      const { Route: Tier2Route } = await import(
        "@/routes/api/public/v1/producer/tier2-verification"
      );

      mockDb.set("users/prod_t2_submit", {
        uid: "prod_t2_submit",
        email: "prod_t2@test.com",
        emailVerified: true,
        roleTags: ["producer"],
      });
      mockDb.set("producers/prod_t2_submit", {
        uid: "prod_t2_submit",
        planStatus: "ACTIVE",
        verificationStatus: "APPROVED",
      });
      mockDb.set("kycProfiles/prod_t2_submit", {
        uid: "prod_t2_submit",
        kycStatus: "approved",
        payoutTier: 1,
      });

      const req = new Request("http://localhost/api/public/v1/producer/tier2-verification", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "prod_t2_submit",
        },
        body: JSON.stringify({
          proofOfAddressVaultPath: "kyc-vault/tenants/prod_t2_submit/address_utility_bill.pdf",
          sourceOfIncomeVaultPath: "kyc-vault/tenants/prod_t2_submit/tax_clearance_cert.pdf",
          sourceOfIncomeDescription: "Commercial television production and syndication revenue",
          declarationAccepted: true,
        }),
      });

      const res = await Tier2Route.options.server!.handlers!.POST!({ request: req } as any);
      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.tier2Status).toBe("pending_review");

      const saved = mockDb.get("kycProfiles/prod_t2_submit");
      expect(saved.tier2Status).toBe("pending_review");
      expect(saved.tier2Documents.sourceOfIncomeDescription).toContain("television production");
    });
  });
});
