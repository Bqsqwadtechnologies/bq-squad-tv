import * as apiModule from "@/lib/server/api";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Firebase Admin and database
const mockFirestoreData = new Map<string, any>();

vi.mock("@/lib/server/firebase-admin", () => {
  class MockFirestore {
    static async create() {
      return new MockFirestore();
    }
    async getDoc(path: string) {
      return mockFirestoreData.get(path) || null;
    }
    async get(path: string) {
      return mockFirestoreData.get(path) || null;
    }
    async setDoc(path: string, data: any) {
      mockFirestoreData.set(path, data);
    }
    async patchDoc(path: string, data: any) {
      const existing = mockFirestoreData.get(path) || {};
      mockFirestoreData.set(path, { ...existing, ...data });
    }
    async deleteDoc(path: string) {
      mockFirestoreData.delete(path);
    }
    async query(collection: string, options?: any) {
      const results: any[] = [];
      for (const [key, val] of mockFirestoreData.entries()) {
        if (key.startsWith(collection + "/")) {
          results.push(val);
        }
      }
      return results;
    }
  }

  class MockApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  }

  return {
    Firestore: MockFirestore,
    ApiError: MockApiError,
  };
});

// Mock audit logger
vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: vi.fn(async (_fs: any, event: any) => {
    const id = `audit_${Date.now()}_${Math.random()}`;
    mockFirestoreData.set(`auditLogs/${id}`, { id, ...event, createdAt: new Date().toISOString() });
    return id;
  }),
}));

// Mock email outbox
vi.mock("@/lib/server/email/outbox", () => ({
  dispatchNotificationEvent: vi.fn(async (_fs: any, payload: any) => {
    const id = `outbox_${Date.now()}_${Math.random()}`;
    mockFirestoreData.set(`emailOutbox/${id}`, { id, ...payload, status: "queued" });
    return { outboxId: id, status: "queued" };
  }),
}));

import {
  getStatutoryRetentionYears,
  computeRetentionExpiryDate,
  isRetentionPeriodActive,
} from "@/lib/server/kyc/retention";
import {
  evaluateDocumentExpiry,
  scanAndProcessDocumentExpiries,
  computeNextReverificationDate,
} from "@/lib/server/kyc/lifecycle";
import { Route as ExportCaseRoute } from "@/routes/api/public/v1/zillionaire/kyc/export-case";
import { Route as LegalHoldRoute } from "@/routes/api/public/v1/zillionaire/kyc/retention/legal-hold";
import { Route as ScanExpiriesRoute } from "@/routes/api/public/v1/zillionaire/kyc/lifecycle/scan-expiries";
import { Route as ProducerNameChangeRoute } from "@/routes/api/public/v1/producer/lifecycle/name-change";
import { Route as ZillionaireNameChangeRoute } from "@/routes/api/public/v1/zillionaire/kyc/lifecycle/name-change";
import { Route as AccountClosureRoute } from "@/routes/api/public/v1/zillionaire/kyc/lifecycle/account-closure";
import { Route as ErasureRequestRoute } from "@/routes/api/public/v1/zillionaire/kyc/lifecycle/erasure-request";
import { Route as DetailRoute } from "@/routes/api/public/v1/zillionaire/kyc/detail";
import { Route as PayoutRequestRoute } from "@/routes/api/public/v1/producer/payouts/request";

describe("Batch C4 — Case File, Retention, Legal Hold, and Lifecycle", () => {
  beforeEach(() => {
    mockFirestoreData.clear();
    process.env["KYC_VAULT_SIGNING_SECRET"] = "super-secret-vault-signing-key-32-bytes-minimum-length!";
    process.env["KYC_FIELD_ENCRYPTION_KEY"] = Buffer.alloc(32, 7).toString("base64");
    process.env["ZILLIONAIRE_EMAIL"] = "khabane@bqsqwad.tv";
    process.env["ZILLIONAIRE_ACCESS_SIGNING_SECRET"] = "super-secret-zillionaire-step-up-signing-secret-32-bytes!";

    vi.spyOn(apiModule, "requireUser").mockImplementation(async (req: Request) => {
      const testUid = req.headers.get("x-test-user-id") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!testUid) {
        const { ApiError } = await import("@/lib/server/firebase-admin");
        throw new ApiError(401, "UNAUTHENTICATED", "Sign-in token required.");
      }
      return {
        uid: testUid,
        email: testUid === "platform_owner" ? "khabane@bqsqwad.tv" : `${testUid}@test.internal`,
        emailVerified: true,
        customClaims: {},
      } as any;
    });
  });

  describe("1. Statutory Retention Rules", () => {
    it("returns correct country-specific retention periods under AML legislation", () => {
      expect(getStatutoryRetentionYears("NG")).toBe(5);
      expect(getStatutoryRetentionYears("US")).toBe(7);
      expect(getStatutoryRetentionYears("GB")).toBe(5);
      expect(getStatutoryRetentionYears("DE")).toBe(5);
      expect(getStatutoryRetentionYears("UNKNOWN")).toBe(5);
    });

    it("accurately calculates retention expiration date and active retention status", () => {
      const recent = new Date().toISOString();
      expect(isRetentionPeriodActive(recent, "NG")).toBe(true);
      expect(isRetentionPeriodActive(recent, "US")).toBe(true);

      const eightYearsAgo = new Date(Date.now() - 8 * 365 * 24 * 60 * 60 * 1000).toISOString();
      expect(isRetentionPeriodActive(eightYearsAgo, "US")).toBe(false);
      expect(isRetentionPeriodActive(eightYearsAgo, "NG")).toBe(false);
    });
  });

  describe("2. Document Expiry & Re-verification Scheduler", () => {
    it("evaluates days remaining until document expiry", () => {
      const future10 = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const eval10 = evaluateDocumentExpiry(future10);
      expect(eval10.isExpired).toBe(false);
      expect(eval10.daysRemaining).toBeGreaterThanOrEqual(9);

      const past5 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const evalPast = evaluateDocumentExpiry(past5);
      expect(evalPast.isExpired).toBe(true);
      expect(evalPast.daysRemaining).toBeLessThanOrEqual(0);
    });

    it("scans profiles, triggers 30-day and 7-day reminders, and auto-expires past documents", async () => {
      const fs = {
        query: async () => [
          {
            uid: "user_expiring_25d",
            role: "producer",
            legalName: "Producer Near Expiry",
            email: "near@test.internal",
            kycStatus: "approved",
            idExpiryDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          },
          {
            uid: "user_expiring_5d",
            role: "producer",
            legalName: "Producer Urgent Expiry",
            email: "urgent@test.internal",
            kycStatus: "approved",
            idExpiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          },
          {
            uid: "user_already_expired",
            role: "producer",
            legalName: "Producer Expired Doc",
            email: "expired@test.internal",
            kycStatus: "approved",
            idExpiryDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          },
        ],
        patchDoc: async (path: string, data: any) => {
          mockFirestoreData.set(path, { ...(mockFirestoreData.get(path) || {}), ...data });
        },
      };

      const scanResult = await scanAndProcessDocumentExpiries(fs);
      expect(scanResult.reminded30Days).toContain("user_expiring_25d");
      expect(scanResult.reminded7Days).toContain("user_expiring_5d");
      expect(scanResult.markedExpired).toContain("user_already_expired");

      // Verify that expired profile is marked expired in persistence
      const expiredProfile = mockFirestoreData.get("kycProfiles/user_already_expired");
      expect(expiredProfile?.kycStatus).toBe("expired");
    });
  });

  describe("3. Forced Re-KYC Workflow", () => {
    it("owner/compliance can force re-KYC on approved account, which resets verification and blocks payouts", async () => {
      mockFirestoreData.set("kycProfiles/producer_rekyc", {
        uid: "producer_rekyc",
        role: "producer",
        legalName: "Verified Producer",
        kycStatus: "approved",
        payoutTier: 1,
      });

      mockFirestoreData.set("producers/producer_rekyc", {
        uid: "producer_rekyc",
        verificationStatus: "APPROVED",
        kycStatus: "approved",
      });

      mockFirestoreData.set("users/compliance_officer", {
        uid: "compliance_officer",
        email: "compliance@bqsqwad.tv",
        role: "zillionaire",
        zillionaireModules: ["compliance"],
      });

      const detailHandler = (DetailRoute as any).options.server.handlers.POST;
      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/detail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "compliance_officer",
        },
        body: JSON.stringify({
          uid: "producer_rekyc",
          action: "force_rekyc",
          reason: "Periodic high-value re-screening mandated by AML compliance.",
        }),
      });

      const res = await detailHandler({ request: req });
      expect(res.status).toBe(200);

      const updatedKyc = mockFirestoreData.get("kycProfiles/producer_rekyc");
      expect(updatedKyc?.kycStatus).toBe("rekyc_required");
      expect(updatedKyc?.payoutTier).toBe(0);
      expect(updatedKyc?.forceRekycReason).toContain("Periodic high-value re-screening");

      const updatedProducer = mockFirestoreData.get("producers/producer_rekyc");
      expect(updatedProducer?.verificationStatus).toBe("UNVERIFIED");
    });
  });

  describe("4. Legal Hold Placement & Payout Suspension", () => {
    it("places and removes legal hold, and fails closed on payout requests when legal hold is active", async () => {
      mockFirestoreData.set("kycProfiles/producer_hold_test", {
        uid: "producer_hold_test",
        role: "producer",
        legalName: "Producer Under Investigation",
        kycStatus: "approved",
        kycCountry: "NG",
        legalHold: false,
      });

      mockFirestoreData.set("users/compliance_officer", {
        uid: "compliance_officer",
        email: "compliance@bqsqwad.tv",
        role: "zillionaire",
        zillionaireModules: ["compliance"],
      });

      const legalHoldHandler = (LegalHoldRoute as any).options.server.handlers.POST;

      // 1. Place legal hold
      const placeReq = new Request("http://localhost/api/public/v1/zillionaire/kyc/retention/legal-hold", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "compliance_officer",
        },
        body: JSON.stringify({
          uid: "producer_hold_test",
          action: "place",
          reason: "Regulatory freeze order case #78192.",
        }),
      });

      const placeRes = await legalHoldHandler({ request: placeReq });
      expect(placeRes.status).toBe(200);

      const holdKyc = mockFirestoreData.get("kycProfiles/producer_hold_test");
      expect(holdKyc?.legalHold).toBe(true);
      expect(holdKyc?.legalHoldReason).toContain("Regulatory freeze order");

      // 2. Verify payout request fails closed with 403 ACCOUNT_ON_LEGAL_HOLD
      mockFirestoreData.set("users/producer_hold_test", {
        uid: "producer_hold_test",
        roleTags: ["producer"],
      });
      mockFirestoreData.set("producers/producer_hold_test", {
        uid: "producer_hold_test",
        planStatus: "ACTIVE",
        verificationStatus: "APPROVED",
        status: "active",
      });

      const payoutHandler = (PayoutRequestRoute as any).options.server.handlers.POST;
      const payoutReq = new Request("http://localhost/api/public/v1/producer/payouts/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "producer_hold_test",
        },
        body: JSON.stringify({
          amountMinor: 50000,
          currency: "USD",
          idempotencyKey: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
        }),
      });

      const payoutRes = await payoutHandler({ request: payoutReq });
      expect(payoutRes.status).toBe(403);
      const payoutErr = await payoutRes.json();
      expect(payoutErr.code).toBe("ACCOUNT_ON_LEGAL_HOLD");

      // 3. Remove legal hold
      const removeReq = new Request("http://localhost/api/public/v1/zillionaire/kyc/retention/legal-hold", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "compliance_officer",
        },
        body: JSON.stringify({
          uid: "producer_hold_test",
          action: "remove",
          reason: "Regulatory inquiry cleared.",
        }),
      });

      const removeRes = await legalHoldHandler({ request: removeReq });
      expect(removeRes.status).toBe(200);
      const unheldKyc = mockFirestoreData.get("kycProfiles/producer_hold_test");
      expect(unheldKyc?.legalHold).toBe(false);
    });
  });

  describe("5. Legal Name Change Workflow", () => {
    it("producer requests name change, compliance reviews and approves or rejects with audit history", async () => {
      mockFirestoreData.set("kycProfiles/producer_nc", {
        uid: "producer_nc",
        role: "producer",
        legalName: "Jane Doe Original",
        kycStatus: "approved",
        nameChangeHistory: [],
      });

      const prodNcHandler = (ProducerNameChangeRoute as any).options.server.handlers.POST;
      const requestChangeReq = new Request("http://localhost/api/public/v1/producer/lifecycle/name-change", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "producer_nc",
        },
        body: JSON.stringify({
          newName: "Jane Smith Married",
          proofDocumentVaultPath: "producer-verification/producer_nc/marriage_cert.pdf",
          reason: "Legal marriage certificate registration.",
        }),
      });

      const reqRes = await prodNcHandler({ request: requestChangeReq });
      expect(reqRes.status).toBe(200);

      const pendingKyc = mockFirestoreData.get("kycProfiles/producer_nc");
      expect(pendingKyc?.pendingNameChange?.newName).toBe("Jane Smith Married");

      // Compliance reviewer approves
      mockFirestoreData.set("users/compliance_officer", {
        uid: "compliance_officer",
        email: "compliance@bqsqwad.tv",
        role: "zillionaire",
        zillionaireModules: ["compliance"],
      });

      const zillNcHandler = (ZillionaireNameChangeRoute as any).options.server.handlers.POST;
      const approveReq = new Request("http://localhost/api/public/v1/zillionaire/kyc/lifecycle/name-change", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "compliance_officer",
        },
        body: JSON.stringify({
          uid: "producer_nc",
          action: "approve",
          notes: "Marriage certificate verified with official registry.",
        }),
      });

      const approveRes = await zillNcHandler({ request: approveReq });
      expect(approveRes.status).toBe(200);

      const approvedKyc = mockFirestoreData.get("kycProfiles/producer_nc");
      expect(approvedKyc?.legalName).toBe("Jane Smith Married");
      expect(approvedKyc?.pendingNameChange).toBeNull();
      expect(approvedKyc?.nameChangeHistory.length).toBe(1);
      expect(approvedKyc?.nameChangeHistory[0].status).toBe("approved");
    });
  });

  describe("6. Account Closure & Data Subject Erasure", () => {
    it("account closure blocks if pending payouts exist, and completes cleanly when resolved", async () => {
      mockFirestoreData.set("kycProfiles/user_close_test", {
        uid: "user_close_test",
        role: "producer",
        legalName: "User Closing Account",
        accountStatus: "ACTIVE",
      });

      mockFirestoreData.set("payoutRequests/payout_pending_1", {
        id: "payout_pending_1",
        producerUid: "user_close_test",
        status: "pending",
      });

      mockFirestoreData.set("users/compliance_officer", {
        uid: "compliance_officer",
        email: "compliance@bqsqwad.tv",
        role: "zillionaire",
        zillionaireModules: ["compliance"],
      });

      const closeHandler = (AccountClosureRoute as any).options.server.handlers.POST;

      // 1. Should fail when pending payouts exist
      const failReq = new Request("http://localhost/api/public/v1/zillionaire/kyc/lifecycle/account-closure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "compliance_officer",
        },
        body: JSON.stringify({
          uid: "user_close_test",
          reason: "User requested account closure.",
        }),
      });

      const failRes = await closeHandler({ request: failReq });
      expect(failRes.status).toBe(409);

      // 2. Clear pending payout and close account
      mockFirestoreData.delete("payoutRequests/payout_pending_1");
      const successReq = new Request("http://localhost/api/public/v1/zillionaire/kyc/lifecycle/account-closure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "compliance_officer",
        },
        body: JSON.stringify({
          uid: "user_close_test",
          reason: "User confirmed account closure.",
        }),
      });

      const successRes = await closeHandler({ request: successReq });
      expect(successRes.status).toBe(200);
      const closedKyc = mockFirestoreData.get("kycProfiles/user_close_test");
      expect(closedKyc?.accountStatus).toBe("CLOSED");
    });

    it("data subject erasure is blocked by active legal hold, applies partial redaction during statutory retention, and retains ledger records", async () => {
      mockFirestoreData.set("kycProfiles/user_erasure_test", {
        uid: "user_erasure_test",
        role: "producer",
        legalName: "Subject John Doe",
        kycCountry: "NG",
        createdAt: new Date().toISOString(), // Recent -> active statutory retention
        legalHold: true,
        legalHoldReason: "Pending subpoena",
      });

      mockFirestoreData.set("users/compliance_officer", {
        uid: "compliance_officer",
        email: "compliance@bqsqwad.tv",
        role: "zillionaire",
        zillionaireModules: ["compliance"],
      });

      const erasureHandler = (ErasureRequestRoute as any).options.server.handlers.POST;

      // 1. Fails when legal hold is active
      const holdReq = new Request("http://localhost/api/public/v1/zillionaire/kyc/lifecycle/erasure-request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "compliance_officer",
        },
        body: JSON.stringify({
          uid: "user_erasure_test",
          reason: "GDPR Article 17 erasure request.",
        }),
      });

      const holdRes = await erasureHandler({ request: holdReq });
      expect(holdRes.status).toBe(409);
      const holdErr = await holdRes.json();
      expect(holdErr.code).toBe("LEGAL_HOLD_ACTIVE");

      // 2. Remove legal hold, attempt erasure during active 5-year statutory period -> partial statutory redaction
      mockFirestoreData.get("kycProfiles/user_erasure_test").legalHold = false;

      const partialReq = new Request("http://localhost/api/public/v1/zillionaire/kyc/lifecycle/erasure-request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "compliance_officer",
        },
        body: JSON.stringify({
          uid: "user_erasure_test",
          reason: "Data subject right to erasure request.",
        }),
      });

      const partialRes = await erasureHandler({ request: partialReq });
      expect(partialRes.status).toBe(200);
      const partialBody = await partialRes.json();
      expect(partialBody.type).toBe("partial_statutory_redaction");
      expect(partialBody.financialRecordsPreserved).toBe(true);

      // 3. Full statutory erasure (when retention elapsed or forceRedactStatutory) -> redacts PII, preserves financial ledger
      const fullReq = new Request("http://localhost/api/public/v1/zillionaire/kyc/lifecycle/erasure-request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "compliance_officer",
        },
        body: JSON.stringify({
          uid: "user_erasure_test",
          reason: "Statutory retention expired, final erasure.",
          forceRedactStatutory: true,
        }),
      });

      const fullRes = await erasureHandler({ request: fullReq });
      expect(fullRes.status).toBe(200);
      const fullBody = await fullRes.json();
      expect(fullBody.type).toBe("full_erasure_retained_financial_ledger");
      expect(fullBody.financialRecordsPreserved).toBe(true);

      const erasedKyc = mockFirestoreData.get("kycProfiles/user_erasure_test");
      expect(erasedKyc?.legalName).toBe("[REDACTED_DATA_SUBJECT]");
    });
  });

  describe("7. Case File Dossier PDF Export with Step-Up", () => {
    it("exports print-ready PDF case dossier with step-up verification and audit trail", async () => {
      mockFirestoreData.set("kycProfiles/case_to_export", {
        uid: "case_to_export",
        role: "producer",
        legalName: "Verified Filmmaker",
        kycStatus: "approved",
        kycCountry: "NG",
        riskScore: 25,
        riskLevel: "low",
        payoutTier: 1,
        consentLog: [
          {
            consentType: "face_biometric",
            noticeVersion: "2026-v1.0",
            noticeUrl: "/help/data-protection#biometrics",
            acceptedAt: "2026-03-01T12:00:00Z",
          },
        ],
      });

      // Zillionaire owner setup
      mockFirestoreData.set("users/platform_owner", {
        uid: "platform_owner",
        email: "khabane@bqsqwad.tv",
        role: "zillionaire",
        isOwner: true,
      });

      const exportHandler = (ExportCaseRoute as any).options.server.handlers.POST;

      // 1. Missing step-up token -> 401
      const noStepUpReq = new Request("http://localhost/api/public/v1/zillionaire/kyc/export-case", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "platform_owner",
        },
        body: JSON.stringify({
          uid: "case_to_export",
          reason: "Official regulatory submission to EFCC/FIU.",
          format: "pdf",
        }),
      });

      const noStepUpRes = await exportHandler({ request: noStepUpReq });
      expect(noStepUpRes.status).toBe(428);

      // 2. Valid step-up token -> Returns official PDF/HTML dossier
      const { createStepUpToken } = await import("@/lib/server/zillionaire-access");
      const { token } = createStepUpToken("platform_owner", "kyc_case_export");

      const validExportReq = new Request("http://localhost/api/public/v1/zillionaire/kyc/export-case", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "platform_owner",
          "x-zillionaire-step-up": token,
        },
        body: JSON.stringify({
          uid: "case_to_export",
          reason: "Official regulatory submission to FIU compliance.",
          format: "pdf",
        }),
      });

      const validExportRes = await exportHandler({ request: validExportReq });
      expect(validExportRes.status).toBe(200);
      expect(validExportRes.headers.get("content-type")).toContain("text/html");
      const html = await validExportRes.text();
      expect(html).toContain("BQ SQWAD TV • KYC COMPLIANCE DOSSIER");
      expect(html).toContain("CASE ID: case_to_export");
      expect(html).toContain("Verified Filmmaker");
      expect(html).toContain("CONFIDENTIAL • BQ SQWAD TV • AUDIT DOSSIER");
    });
  });
});
