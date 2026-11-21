import { describe, it, expect, vi, beforeEach } from "vitest";
import * as apiModule from "@/lib/server/api";

// In-memory mock database
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

vi.mock("@/lib/server/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => true),
}));

vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: vi.fn(async (_fs: any, input: any) => {
    const id = "mock_audit_" + Math.random().toString(36).substring(2, 9);
    mockDb.set("auditLog/" + id, { ...input, createdAt: new Date().toISOString() });
    return id;
  }),
}));

describe("Batch B2 — Payout Account Verification and Review Flow", () => {
  beforeEach(() => {
    mockDb.clear();
    process.env["KYC_VAULT_SIGNING_SECRET"] = "super-secret-vault-signing-key-32-bytes-minimum-length!";
    process.env["KYC_FIELD_ENCRYPTION_KEY"] = Buffer.alloc(32, 7).toString("base64");
    process.env["ZILLIONAIRE_EMAIL"] = "owner@bqsqwad.tv";

    // Setup active, verified producer user in mock database
    mockDb.set("users/user_producer_b2", {
      uid: "user_producer_b2",
      email: "producer@example.com",
      roleTags: ["producer"],
      appEmailVerified: true,
    });
    mockDb.set("producers/user_producer_b2", {
      planStatus: "ACTIVE",
      verificationStatus: "APPROVED",
    });

    vi.spyOn(apiModule, "requireUser").mockImplementation(async (req: Request) => {
      const auth = req.headers.get("authorization");
      if (!auth) {
        const { ApiError } = await import("@/lib/server/firebase-admin");
        throw new ApiError(401, "UNAUTHENTICATED", "A Firebase sign-in token is required.");
      }
      const token = auth.replace(/^Bearer\s+/i, "");
      if (token === "unauthorized_user") {
        return {
          uid: "unauthorized_user",
          email: "viewer@example.com",
          emailVerified: true,
          customClaims: {},
        } as any;
      }
      if (token === "compliance_officer_1") {
        return {
          uid: "compliance_officer_1",
          email: "owner@bqsqwad.tv",
          emailVerified: true,
          customClaims: { zillionaireOwner: true },
        } as any;
      }
      return {
        uid: token || "user_producer_b2",
        email: "producer@example.com",
        emailVerified: true,
        customClaims: { producer: true },
      } as any;
    });
  });

  describe("Proof of Account Upload API", () => {
    it("rejects upload if not authenticated", async () => {
      const { Route } = await import("@/routes/api/public/v1/producer/payout-proof-upload");
      const handler = (Route as any).options.server.handlers.POST;

      const req = new Request("http://localhost/api/public/v1/producer/payout-proof-upload", {
        method: "POST",
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(401);
    });

    it("rejects upload with invalid mime type", async () => {
      const { Route } = await import("@/routes/api/public/v1/producer/payout-proof-upload");
      const handler = (Route as any).options.server.handlers.POST;

      const formData = new FormData();
      const fakeFile = new Blob(["not-an-executable"], { type: "application/x-msdownload" });
      formData.append("file", fakeFile, "malicious.exe");

      const req = new Request("http://localhost/api/public/v1/producer/payout-proof-upload", {
        method: "POST",
        headers: {
          authorization: "Bearer user_test_b2",
        },
        body: formData,
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/unsupported file type/i);
    });

    it("accepts valid PDF bank statement upload", async () => {
      const { Route } = await import("@/routes/api/public/v1/producer/payout-proof-upload");
      const handler = (Route as any).options.server.handlers.POST;

      const formData = new FormData();
      const statementFile = new Blob(["%PDF-1.4 official statement content"], { type: "application/pdf" });
      formData.append("file", statementFile, "bank_statement_nov2026.pdf");
      formData.append("fileName", "bank_statement_nov2026.pdf");

      const req = new Request("http://localhost/api/public/v1/producer/payout-proof-upload", {
        method: "POST",
        headers: {
          authorization: "Bearer user_producer_b2",
        },
        body: formData,
      });

      const res = await handler({ request: req });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.proofDocumentPath).toMatch(/^kyc-vault\/payout-proof\/user_producer_b2\/[a-f0-9]+_bank_statement_nov2026\.pdf$/);
      expect(json.proofDocumentFileName).toBe("bank_statement_nov2026.pdf");
    });
  });

  describe("Producer Payout Profile Submission & Verification State", () => {
    it("submits payout account with proof and marks as pending review", async () => {
      // Seed KYC record for user
      mockDb.set("kycProfiles/user_producer_b2", {
        uid: "user_producer_b2",
        legalName: "Jane Doe Film Productions",
        fullName: "Jane Doe Film Productions",
        kycCountry: "NG",
        status: "approved",
      });

      const { Route } = await import("@/routes/api/public/v1/producer/payout-profile");
      const postHandler = (Route as any).options.server.handlers.POST;

      const req = new Request("http://localhost/api/public/v1/producer/payout-profile", {
        method: "POST",
        headers: {
          authorization: "Bearer user_producer_b2",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bankName: "First Bank of Nigeria",
          bankAddress: "35 Marina, Lagos, Nigeria",
          isManualBank: false,
          accountNumber: "0123456789",
          confirmAccountNumber: "0123456789",
          beneficiaryName: "Jane Doe Film Productions",
          beneficiaryAddress: "Plot 10, Victoria Island, Lagos",
          accountType: "checking",
          currency: "NGN",
          swiftBic: "FBNINGLAXXX",
          purposeOfPayment: "Content licensing earnings settlement",
          proofDocumentPath: "kyc-vault/payout-proof/user_producer_b2/abc_statement.pdf",
          proofDocumentFileName: "abc_statement.pdf",
        }),
      });

      const res = await postHandler({ request: req });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.profile.verificationStatus).toBe("pending");
      expect(json.profile.payoutsPaused).toBe(false);
      expect(json.profile.checks.countryMatch).toBe(true);
      expect(json.profile.checks.formatValid).toBe(true);
      expect(json.profile.checks.nameMatch).toBe(true);
      expect(json.profile.checks.duplicateDetected).toBe(false);

      // Verify Firestore profile record
      const stored = mockDb.get("payoutProfiles/user_producer_b2");
      expect(stored).toBeDefined();
      expect(stored.verificationStatus).toBe("pending");
      expect(stored.proofDocumentPath).toBe("kyc-vault/payout-proof/user_producer_b2/abc_statement.pdf");
    });
  });

  describe("Zillionaire Payout Accounts Review API", () => {
    it("rejects unauthorized review request", async () => {
      const { Route } = await import("@/routes/api/public/v1/zillionaire/kyc/payout-accounts");
      const getHandler = (Route as any).options.server.handlers.GET;

      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/payout-accounts", {
        method: "GET",
        headers: {
          authorization: "Bearer unauthorized_user",
        },
      });

      const res = await getHandler({ request: req });
      expect(res.status).toBe(403);
    });

    it("lists payout accounts with signed viewer links for owner/compliance reviewer", async () => {
      // Seed pending payout account
      mockDb.set("payoutProfiles/user_producer_b2", {
        uid: "user_producer_b2",
        beneficiaryName: "Jane Doe Film Productions",
        beneficiaryAddress: "Plot 10, Victoria Island, Lagos",
        bankName: "First Bank of Nigeria",
        bankCountry: "NG",
        bankAddress: "35 Marina, Lagos, Nigeria",
        accountNumberMasked: "******6789",
        accountType: "checking",
        currency: "NGN",
        swiftBic: "FBNINGLAXXX",
        purposeOfPayment: "Content licensing earnings settlement",
        isManualBank: false,
        verificationStatus: "pending",
        isLocked: false,
        payoutsPaused: false,
        proofDocumentPath: "kyc-vault/payout-proof/user_producer_b2/abc_statement.pdf",
        proofDocumentFileName: "abc_statement.pdf",
        checks: {
          nameMatch: true,
          formatValid: true,
          currencyValid: true,
          countryMatch: true,
          duplicateDetected: false,
        },
        updatedAt: new Date().toISOString(),
      });

      const { Route } = await import("@/routes/api/public/v1/zillionaire/kyc/payout-accounts");
      const getHandler = (Route as any).options.server.handlers.GET;

      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/payout-accounts?tab=pending", {
        method: "GET",
        headers: {
          authorization: "Bearer compliance_officer_1",
        },
      });

      const res = await getHandler({ request: req });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.counters.pending).toBe(1);
      expect(json.items).toHaveLength(1);
      expect(json.items[0].beneficiaryName).toBe("Jane Doe Film Productions");
      expect(json.items[0].proofViewerUrl).toMatch(/^\/api\/public\/v1\/zillionaire\/kyc\/view-doc\?path=/);
    });

    it("approves payout account and locks it", async () => {
      // Seed pending payout account
      mockDb.set("payoutProfiles/user_producer_b2", {
        uid: "user_producer_b2",
        beneficiaryName: "Jane Doe Film Productions",
        verificationStatus: "pending",
        isLocked: false,
        payoutsPaused: false,
      });

      const { Route } = await import("@/routes/api/public/v1/zillionaire/kyc/payout-accounts");
      const postHandler = (Route as any).options.server.handlers.POST;

      const req = new Request("http://localhost/api/public/v1/zillionaire/kyc/payout-accounts", {
        method: "POST",
        headers: {
          authorization: "Bearer compliance_officer_1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid: "user_producer_b2",
          action: "approve",
        }),
      });

      const res = await postHandler({ request: req });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.action).toBe("approve");

      // Verify Firestore profile update
      const updated = mockDb.get("payoutProfiles/user_producer_b2");
      expect(updated.verificationStatus).toBe("approved");
      expect(updated.isLocked).toBe(true);
      expect(updated.payoutsPaused).toBe(false);

      // Verify notification sent
      const notifs = [...mockDb.entries()].filter(([k]) => k.startsWith("notifications/notif_payout_account_user_producer_b2"));
      expect(notifs.length).toBeGreaterThan(0);
      const notif = notifs[0][1];
      expect(notif.title).toMatch(/Payout Bank Account Verified/i);
    });

    it("rejects payout account with mandatory reason and pauses payouts", async () => {
      // Reset to pending
      mockDb.set("payoutProfiles/user_producer_b2", {
        uid: "user_producer_b2",
        beneficiaryName: "Jane Doe Film Productions",
        verificationStatus: "pending",
        isLocked: false,
        payoutsPaused: false,
      });

      const { Route } = await import("@/routes/api/public/v1/zillionaire/kyc/payout-accounts");
      const postHandler = (Route as any).options.server.handlers.POST;

      // Missing reason should fail
      const reqFail = new Request("http://localhost/api/public/v1/zillionaire/kyc/payout-accounts", {
        method: "POST",
        headers: {
          authorization: "Bearer compliance_officer_1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid: "user_producer_b2",
          action: "reject",
        }),
      });

      const resFail = await postHandler({ request: reqFail });
      expect(resFail.status).toBe(400);

      // Rejection with reason
      const reqOk = new Request("http://localhost/api/public/v1/zillionaire/kyc/payout-accounts", {
        method: "POST",
        headers: {
          authorization: "Bearer compliance_officer_1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid: "user_producer_b2",
          action: "reject",
          reason: "Bank statement address does not match verified legal entity address.",
        }),
      });

      const resOk = await postHandler({ request: reqOk });
      expect(resOk.status).toBe(200);

      const rejected = mockDb.get("payoutProfiles/user_producer_b2");
      expect(rejected.verificationStatus).toBe("rejected");
      expect(rejected.payoutsPaused).toBe(true);
      expect(rejected.rejectionReason).toBe("Bank statement address does not match verified legal entity address.");
    });
  });
});
