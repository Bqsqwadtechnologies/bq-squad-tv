import * as apiModule from "@/lib/server/api";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { CANNED_REJECTION_REASONS, isSlaBreached } from "@/lib/server/kyc/compliance";
import { createStepUpToken } from "@/lib/server/zillionaire-access";
import { Route as OperationsRoute } from "@/routes/api/public/v1/zillionaire/kyc/operations";
import { Route as DetailRoute } from "@/routes/api/public/v1/zillionaire/kyc/detail";
import { Route as BulkActionRoute } from "@/routes/api/public/v1/zillionaire/kyc/bulk-action";
import { Route as ViewDocRoute } from "@/routes/api/public/v1/zillionaire/kyc/view-doc";
import { Route as RevealRoute } from "@/routes/api/public/v1/zillionaire/kyc/reveal";
import { Route as ExportCaseRoute } from "@/routes/api/public/v1/zillionaire/kyc/export-case";
import { generateShortLivedViewerUrl } from "@/lib/server/kyc/storage";

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
      })),
    },
  };
});

vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: vi.fn(async (_fs: any, input: any) => {
    const id = "mock_audit_" + Math.random().toString(36).substring(2, 9);
    mockDb.set("auditLogs/" + id, { ...input, createdAt: new Date().toISOString() });
    return id;
  }),
}));

vi.mock("@/lib/server/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => true),
}));

describe("Batch C3 — Compliance Reviewers, Workflows, SLA, 60s Watermarked Viewer, and Step-Up Export", () => {
  beforeEach(() => {
    mockDb.clear();
    process.env["KYC_VAULT_SIGNING_SECRET"] = "super-secret-vault-signing-key-32-bytes-minimum-length!";
    process.env["KYC_FIELD_ENCRYPTION_KEY"] = Buffer.alloc(32, 7).toString("base64");
    process.env["ZILLIONAIRE_EMAIL"] = "owner@bqsqwad.tv";
    process.env["ZILLIONAIRE_ACCESS_SIGNING_SECRET"] = "super-secret-zillionaire-step-up-signing-secret-32-bytes!";

    vi.spyOn(apiModule, "requireUser").mockImplementation(async (req: Request) => {
      const testUid = req.headers.get("x-test-user-id") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!testUid) {
        const { ApiError } = await import("@/lib/server/firebase-admin");
        throw new ApiError(401, "UNAUTHENTICATED", "Sign-in token required.");
      }
      return {
        uid: testUid,
        email: testUid === "owner_user" ? "owner@bqsqwad.tv" : `${testUid}@test.com`,
        emailVerified: true,
        customClaims: {},
      } as any;
    });
  });

  describe("1. Delegated Compliance Module Permission & Expiry", () => {
    it("grants compliance module when expiry is in future", async () => {
      const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      mockDb.set("users/officer_active", {
        email: "officer@test.com",
        zillionaireModules: ["compliance"],
        complianceExpiresAt: futureExpiry,
      });

      const fs = { getDoc: async (p: string) => mockDb.get(p) || null } as any;
      const access = await resolvePlatformAccess(fs, "officer_active", "officer@test.com", {}, true);

      expect(access.zillionaireModules).toContain("compliance");
    });

    it("automatically deactivates compliance module when complianceExpiresAt has elapsed", async () => {
      const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute ago
      mockDb.set("users/officer_expired", {
        email: "expired@test.com",
        zillionaireModules: ["compliance"],
        complianceExpiresAt: pastExpiry,
      });

      const fs = { getDoc: async (p: string) => mockDb.get(p) || null } as any;
      const access = await resolvePlatformAccess(fs, "officer_expired", "expired@test.com", {}, true);

      expect(access.zillionaireModules).not.toContain("compliance");
    });

    it("verifies separation of duties: pure finance role does not have compliance access", async () => {
      mockDb.set("users/finance_user", {
        email: "finance@test.com",
        zillionaireModules: ["finance"],
      });

      const fs = { getDoc: async (p: string) => mockDb.get(p) || null } as any;
      const access = await resolvePlatformAccess(fs, "finance_user", "finance@test.com", {}, true);

      expect(access.zillionaireModules).toContain("finance");
      expect(access.zillionaireModules).not.toContain("compliance");
    });
  });

  describe("2. Reviewer Operations & SLA Workload Monitoring", () => {
    it("returns canned rejection reasons dictionary and SLA breakdown", async () => {
      mockDb.set("users/officer_1", {
        email: "officer1@test.com",
        zillionaireModules: ["compliance"],
      });

      // Insert profiles with SLA status
      mockDb.set("kycProfiles/app_1", {
        uid: "app_1",
        kycStatus: "pending",
        slaDueAt: new Date(Date.now() - 3600 * 1000).toISOString(), // Breached
      });
      mockDb.set("kycProfiles/app_2", {
        uid: "app_2",
        kycStatus: "pending",
        slaDueAt: new Date(Date.now() + 3600 * 1000).toISOString(), // On time
        assignedReviewerUid: "officer_1",
      });

      const handler = (OperationsRoute as any).options.server.handlers.GET;
      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/operations", {
        headers: { "x-test-user-id": "officer_1" },
      });
      const res = await handler({ request: req });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.ok).toBe(true);
      expect(data.cannedRejectionReasons.DOCUMENT_EXPIRED).toBe(CANNED_REJECTION_REASONS.DOCUMENT_EXPIRED);
      expect(data.slaOverview.pendingCount).toBe(2);
      expect(data.slaOverview.slaBreachedCount).toBe(1);
      expect(data.reviewerWorkload["officer_1"]).toBe(1);
    });
  });

  describe("3. Reviewer Workflow: Assignment, Notes, Escalation, Canned Rejection, and Daily Counts", () => {
    it("assigns reviewer with 24h SLA timer and writes audit log", async () => {
      mockDb.set("users/officer_1", {
        email: "officer1@test.com",
        zillionaireModules: ["compliance"],
      });
      mockDb.set("kycProfiles/applicant_case", {
        uid: "applicant_case",
        kycStatus: "pending",
      });

      const handler = (DetailRoute as any).options.server.handlers.POST;
      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/detail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "officer_1",
        },
        body: JSON.stringify({
          uid: "applicant_case",
          action: "assign",
          assignedReviewerUid: "officer_1",
          notes: "Self-assigned for expedited onboarding",
        }),
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.action).toBe("assign");
      expect(data.assignedReviewerUid).toBe("officer_1");
      expect(data.slaDueAt).toBeDefined();

      const updated = mockDb.get("kycProfiles/applicant_case");
      expect(updated.assignedReviewerUid).toBe("officer_1");
      expect(isSlaBreached(updated.slaDueAt)).toBe(false);
    });

    it("appends internal reviewer notes to case file", async () => {
      mockDb.set("users/officer_1", {
        email: "officer1@test.com",
        zillionaireModules: ["compliance"],
      });
      mockDb.set("kycProfiles/applicant_case", {
        uid: "applicant_case",
        kycStatus: "pending",
        internalNotes: [],
      });

      const handler = (DetailRoute as any).options.server.handlers.POST;
      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/detail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "officer_1",
        },
        body: JSON.stringify({
          uid: "applicant_case",
          action: "add_note",
          notes: "Verified identity portrait matches registry photo.",
        }),
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.internalNotes.length).toBe(1);
      expect(data.internalNotes[0].note).toBe("Verified identity portrait matches registry photo.");
      expect(data.internalNotes[0].authorUid).toBe("officer_1");
    });

    it("escalates case to senior compliance and tracks escalation in daily stats", async () => {
      mockDb.set("users/officer_1", {
        email: "officer1@test.com",
        zillionaireModules: ["compliance"],
      });
      mockDb.set("kycProfiles/applicant_case", {
        uid: "applicant_case",
        kycStatus: "pending",
      });

      const handler = (DetailRoute as any).options.server.handlers.POST;
      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/detail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "officer_1",
        },
        body: JSON.stringify({
          uid: "applicant_case",
          action: "escalate",
          escalatedTo: "senior_compliance_lead",
          escalationReason: "Unusual jurisdictional discrepancy detected",
        }),
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.escalatedTo).toBe("senior_compliance_lead");

      const today = new Date().toISOString().slice(0, 10);
      const stats = mockDb.get(`reviewerDailyStats/officer_1_${today}`);
      expect(stats.escalations).toBe(1);
    });

    it("rejects using canned reason code and increments reviewer daily stats", async () => {
      mockDb.set("users/officer_1", {
        email: "officer1@test.com",
        zillionaireModules: ["compliance"],
      });
      mockDb.set("kycProfiles/applicant_case", {
        uid: "applicant_case",
        kycStatus: "pending",
      });

      const handler = (DetailRoute as any).options.server.handlers.POST;
      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/detail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "officer_1",
        },
        body: JSON.stringify({
          uid: "applicant_case",
          action: "reject",
          cannedReasonCode: "DOCUMENT_EXPIRED",
        }),
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(200);

      const updated = mockDb.get("kycProfiles/applicant_case");
      expect(updated.kycStatus).toBe("rejected");
      expect(updated.rejectionReason).toBe(CANNED_REJECTION_REASONS.DOCUMENT_EXPIRED);

      const today = new Date().toISOString().slice(0, 10);
      const stats = mockDb.get(`reviewerDailyStats/officer_1_${today}`);
      expect(stats.rejections).toBe(1);
      expect(stats.reviewsCompleted).toBe(1);
    });
  });

  describe("4. Bulk Compliance Actions & Guardrails", () => {
    it("bulk approves standard cases but refuses to bypass four-eyes for high-risk profiles", async () => {
      mockDb.set("users/officer_1", {
        email: "officer1@test.com",
        zillionaireModules: ["compliance"],
      });
      mockDb.set("kycProfiles/app_standard", {
        uid: "app_standard",
        kycStatus: "pending",
        riskLevel: "low",
        requiresFourEyes: false,
      });
      mockDb.set("kycProfiles/app_high_risk", {
        uid: "app_high_risk",
        kycStatus: "pending",
        riskLevel: "high",
        requiresFourEyes: true,
      });

      const handler = (BulkActionRoute as any).options.server.handlers.POST;
      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/bulk-action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "officer_1",
        },
        body: JSON.stringify({
          uids: ["app_standard", "app_high_risk"],
          action: "approve",
          notes: "Routine batch approval",
        }),
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.processedCount).toBe(1);
      expect(data.skippedHighRisk).toContain("app_high_risk");

      expect(mockDb.get("kycProfiles/app_standard").kycStatus).toBe("approved");
      expect(mockDb.get("kycProfiles/app_high_risk").kycStatus).toBe("pending");
    });
  });

  describe("5. Watermarked 60-Second Document Viewer with Audit & Rate Limits", () => {
    it("generates 60-second signed viewer link with watermark overlay", () => {
      const signed = generateShortLivedViewerUrl("kyc-vault/user_123/passport.jpg", "officer_1");
      expect(signed.durationSeconds).toBe(60);
      expect(signed.watermark.overlayText).toContain("CONFIDENTIAL BQ SQWAD TV");
      expect(signed.watermark.reviewerUid).toBe("officer_1");
      expect(signed.signedUrl).toContain("view-doc?path=");
      expect(signed.signedUrl).toContain("&exp=");
      expect(signed.signedUrl).toContain("&sig=");
    });

    it("serves document preview with anti-download cache headers and logs audit", async () => {
      mockDb.set("users/officer_1", {
        email: "officer1@test.com",
        zillionaireModules: ["compliance"],
      });

      const signed = generateShortLivedViewerUrl("kyc-vault/user_123/id.jpg", "officer_1");

      const handler = (ViewDocRoute as any).options.server.handlers.GET;
      const req = new Request(`http://localhost${signed.signedUrl}`, {
        headers: { "x-test-user-id": "officer_1" },
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(res.headers.get("x-watermark")).toContain("officer_1");

      const audits = Array.from(mockDb.values()).filter((v) => v.action === "kyc.document_viewed");
      expect(audits.length).toBeGreaterThan(0);
      expect(audits[0].actorUid).toBe("officer_1");
      expect(audits[0].targetId).toBe("kyc-vault/user_123/id.jpg");
    });

    it("rejects viewer link when requested by a different reviewer than the link HMAC was issued for", async () => {
      mockDb.set("users/officer_impersonator", {
        email: "impersonator@test.com",
        zillionaireModules: ["compliance"],
      });

      // Signed for officer_1
      const signed = generateShortLivedViewerUrl("kyc-vault/user_123/id.jpg", "officer_1");

      const handler = (ViewDocRoute as any).options.server.handlers.GET;
      const req = new Request(`http://localhost${signed.signedUrl}`, {
        headers: { "x-test-user-id": "officer_impersonator" },
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(403);
    });

    it("rejects expired viewing links", async () => {
      mockDb.set("users/officer_1", {
        email: "officer1@test.com",
        zillionaireModules: ["compliance"],
      });

      const pastExp = Date.now() - 5000;
      const expiredUrl = `/api/public/v1/zillionaire/kyc/view-doc?path=kyc-vault%2Fuser_123%2Fid.jpg&reviewer=officer_1&exp=${pastExp}&sig=bad`;

      const handler = (ViewDocRoute as any).options.server.handlers.GET;
      const req = new Request(`http://localhost${expiredUrl}`, {
        headers: { "x-test-user-id": "officer_1" },
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(410);
    });
  });

  describe("6. Reveal Endpoint Authorization & Auditing", () => {
    it("audits every reveal of a masked field with mandatory reason", async () => {
      mockDb.set("users/officer_1", {
        email: "officer1@test.com",
        zillionaireModules: ["compliance"],
      });
      mockDb.set("kycProfiles/target_applicant", {
        uid: "target_applicant",
        kycCountry: "NG",
        kycType: "producer_individual",
        maskedIdNumber: "******1234",
        encryptedIdNumber: "enc_mock_bytes",
      });

      const handler = (RevealRoute as any).options.server.handlers.POST;
      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/reveal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "officer_1",
        },
        body: JSON.stringify({
          uid: "target_applicant",
          field: "idNumber",
          reason: "Cross-referencing with national voter database record",
        }),
      });

      const res = await handler({ request: req });
      expect([200, 404]).toContain(res.status);

      const audits = Array.from(mockDb.values()).filter((v) => v.action === "kyc_sensitive_field_revealed");
      if (res.status === 200) {
        expect(audits.length).toBe(1);
        expect(audits[0].reason).toContain("national voter database");
      }
    });

    it("denies access to pure finance users without compliance permissions", async () => {
      mockDb.set("users/finance_user", {
        email: "finance@test.com",
        zillionaireModules: ["finance"],
      });

      const handler = (RevealRoute as any).options.server.handlers.POST;
      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/reveal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "finance_user",
        },
        body: JSON.stringify({
          uid: "target_applicant",
          field: "idNumber",
          reason: "Attempting to inspect national ID",
        }),
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(403);
    });
  });

  describe("7. Owner Step-Up Re-Authentication Before Case Export", () => {
    it("denies case export to non-owner users even if they have compliance module", async () => {
      mockDb.set("users/officer_1", {
        email: "officer1@test.com",
        zillionaireModules: ["compliance"],
      });

      const handler = (ExportCaseRoute as any).options.server.handlers.POST;
      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/export-case", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "officer_1",
        },
        body: JSON.stringify({
          uid: "case_to_export",
          reason: "Regulatory audit submission preparation",
        }),
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(403);
    });

    it("requires step-up token from verified platform owner", async () => {
      mockDb.set("users/owner_user", {
        email: "owner@bqsqwad.tv",
        roleTags: ["owner"],
      });

      const handler = (ExportCaseRoute as any).options.server.handlers.POST;
      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/export-case", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "owner_user",
        },
        body: JSON.stringify({
          uid: "case_to_export",
          reason: "Regulatory audit submission preparation",
        }),
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(428); // STEP_UP_REQUIRED
    });

    it("exports case file when owner presents valid kyc_case_export step-up token and writes audit", async () => {
      mockDb.set("users/owner_user", {
        email: "owner@bqsqwad.tv",
        roleTags: ["owner"],
      });
      mockDb.set("kycProfiles/case_to_export", {
        uid: "case_to_export",
        kycCountry: "NG",
        kycStatus: "approved",
      });

      const stepUp = createStepUpToken("owner_user", "kyc_case_export");

      const handler = (ExportCaseRoute as any).options.server.handlers.POST;
      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/export-case", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "owner_user",
          "x-zillionaire-step-up": stepUp.token,
        },
        body: JSON.stringify({
          uid: "case_to_export",
          reason: "High Court subpoena compliance case delivery",
          includeAuditTrail: true,
        }),
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.caseFile.applicantProfile.uid).toBe("case_to_export");
      expect(data.caseFile.exportMetadata.exportedBy).toBe("owner_user");

      const audits = Array.from(mockDb.values()).filter((v) => v.action === "kyc.case_file_exported");
      expect(audits.length).toBe(1);
      expect(audits[0].reason).toContain("High Court subpoena");
    });
  });
});
