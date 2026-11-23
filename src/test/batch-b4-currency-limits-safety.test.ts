import { describe, it, expect, vi, beforeEach } from "vitest";
import * as apiModule from "@/lib/server/api";

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
        query: vi.fn(async (col: string) => {
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
      commit: vi.fn(async (writes: any[]) => {
        for (const w of writes) {
          if (w.update) {
            const name = w.update.name;
            const fields = w.update.fields;
            mockDb.set(name, { ...(mockDb.get(name) || {}), ...fields });
          }
        }
      }),
    },
  };
});

vi.mock("@/lib/server/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => true),
}));

vi.mock("@/lib/server/zillionaire-access", () => ({
  requireStepUp: vi.fn(async () => true),
}));

describe("Batch B4 — Currency Rules, Limits, Dual Approval, and Safety Holds", () => {
  beforeEach(() => {
    mockDb.clear();
    process.env["KYC_VAULT_SIGNING_SECRET"] = "super-secret-vault-signing-key-32-bytes-minimum-length!";
    process.env["KYC_FIELD_ENCRYPTION_KEY"] = Buffer.alloc(32, 9).toString("base64");
    process.env["ZILLIONAIRE_EMAIL"] = "owner@bqsqwad.tv";

    // Setup owner
    mockDb.set("users/owner_b4", {
      uid: "owner_b4",
      email: "owner@bqsqwad.tv",
      appEmailVerified: true,
      emailVerified: true,
    });
    mockDb.set("zillionaireModules/owner_b4", {
      payouts: true,
    });

    // Setup reviewer 2
    mockDb.set("users/reviewer_2", {
      uid: "reviewer_2",
      email: "finance@bqsqwad.tv",
      appEmailVerified: true,
      emailVerified: true,
      zillionaireModules: ["payouts"],
    });
    mockDb.set("zillionaireModules/reviewer_2", {
      payouts: true,
    });

    // Setup active producer
    mockDb.set("users/prod_safety_test", {
      uid: "prod_safety_test",
      email: "producer@example.com",
      roleTags: ["producer"],
      appEmailVerified: true,
    });
    mockDb.set("producers/prod_safety_test", {
      planStatus: "ACTIVE",
      verificationStatus: "APPROVED",
      earningsBalanceByCurrency: { USD: 1000000, NGN: 150000000 }, // $10,000 and ₦1,500,000
    });
    mockDb.set("kycProfiles/prod_safety_test", {
      kycStatus: "approved",
      expiresAt: "2029-12-31T23:59:59.000Z",
    });
    mockDb.set("payoutProfiles/prod_safety_test", {
      status: "APPROVED",
      beneficiaryName: "Safety Producer",
      bankName: "Wema Bank",
      accountNumberMasked: "******1234",
      currency: "USD",
      country: "US",
    });

    vi.spyOn(apiModule, "requireUser").mockImplementation(async (req: Request) => {
      const auth = req.headers.get("authorization");
      if (!auth) {
        const { ApiError } = await import("@/lib/server/firebase-admin");
        throw new ApiError(401, "UNAUTHENTICATED", "Sign-in token required.");
      }
      const token = auth.replace(/^Bearer\s+/i, "");
      if (token === "owner_token") {
        return { uid: "owner_b4", email: "owner@bqsqwad.tv", emailVerified: true, customClaims: {} } as any;
      }
      if (token === "reviewer_2_token") {
        return { uid: "reviewer_2", email: "finance@bqsqwad.tv", emailVerified: true, customClaims: {} } as any;
      }
      if (token === "producer_token") {
        return { uid: "prod_safety_test", email: "producer@example.com", emailVerified: true, customClaims: {} } as any;
      }
      throw new Error("Unknown token");
    });
  });

  it("owner can get and update currency rules with audit log", async () => {
    const { Route } = await import("@/routes/api/public/v1/zillionaire/payouts/rules");
    const getHandler = (Route as any).options.server.handlers.GET;
    const postHandler = (Route as any).options.server.handlers.POST;

    // 1. GET default rules
    const reqGet = new Request("http://localhost/api/public/v1/zillionaire/payouts/rules", {
      headers: { authorization: "Bearer owner_token" },
    });
    const resGet = await getHandler({ request: reqGet });
    expect(resGet.status).toBe(200);
    const dataGet = await resGet.json();
    expect(dataGet.rules.minimumPayoutUSDMinor).toBe(50000); // $500.00
    expect(dataGet.rules.usdToNgnRate).toBe(1500);

    // 2. POST update rules
    const reqPost = new Request("http://localhost/api/public/v1/zillionaire/payouts/rules", {
      method: "POST",
      headers: { authorization: "Bearer owner_token", "content-type": "application/json" },
      body: JSON.stringify({
        minimumPayoutUSDMinor: 60000, // $600
        minimumPayoutNGNMinor: 90000000, // ₦900,000
        usdToNgnRate: 1550,
        dualApprovalThresholdUSDMinor: 750000,
        dualApprovalThresholdNGNMinor: 1162500000,
        stepUpThresholdUSDMinor: 200000,
        stepUpThresholdNGNMinor: 310000000,
        reason: "Adjusted minimums and foreign exchange rate for Q4",
      }),
    });
    const resPost = await postHandler({ request: reqPost });
    expect(resPost.status).toBe(200);
    const dataPost = await resPost.json();
    expect(dataPost.success).toBe(true);
    expect(dataPost.rules.minimumPayoutUSDMinor).toBe(60000);
    expect(dataPost.rules.usdToNgnRate).toBe(1550);

    // Verify audit log
    const auditEntries = Array.from(mockDb.entries()).filter(([k, v]) =>
      k.startsWith("auditLog/") && v.action === "payout.rules.updated"
    );
    expect(auditEntries.length).toBeGreaterThan(0);
    expect(auditEntries[0]?.[1].reason).toContain("Adjusted minimums");
  });

  it("producer payout request fails if below minimum payout limit ($500 / 50000 minor)", async () => {
    const { Route } = await import("@/routes/api/public/v1/producer/payouts/request");
    const handler = (Route as any).options.server.handlers.POST;

    const req = new Request("http://localhost/api/public/v1/producer/payouts/request", {
      method: "POST",
      headers: { authorization: "Bearer producer_token", "content-type": "application/json" },
      body: JSON.stringify({
        amountMinor: 25000, // $250.00 (below $500 limit)
        currency: "USD",
        idempotencyKey: "11111111-2222-3333-4444-555555555555",
      }),
    });

    const res = await handler({ request: req });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("MINIMUM_PAYOUT_NOT_MET");
    expect(data.message).toContain("$500.00");
  });

  it("producer payout request fails if KYC document is expired", async () => {
    mockDb.set("kycProfiles/prod_safety_test", {
      kycStatus: "approved",
      expiresAt: "2020-01-01T00:00:00.000Z", // Expired!
    });

    const { Route } = await import("@/routes/api/public/v1/producer/payouts/request");
    const handler = (Route as any).options.server.handlers.POST;

    const req = new Request("http://localhost/api/public/v1/producer/payouts/request", {
      method: "POST",
      headers: { authorization: "Bearer producer_token", "content-type": "application/json" },
      body: JSON.stringify({
        amountMinor: 100000, // $1,000.00
        currency: "USD",
        idempotencyKey: "22222222-3333-4444-5555-666666666666",
      }),
    });

    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("KYC_EXPIRED");
  });

  it("producer payout request fails if payout account is under review or paused", async () => {
    mockDb.set("payoutProfiles/prod_safety_test", {
      status: "PENDING_REVIEW", // Not approved!
    });

    const { Route } = await import("@/routes/api/public/v1/producer/payouts/request");
    const handler = (Route as any).options.server.handlers.POST;

    const req = new Request("http://localhost/api/public/v1/producer/payouts/request", {
      method: "POST",
      headers: { authorization: "Bearer producer_token", "content-type": "application/json" },
      body: JSON.stringify({
        amountMinor: 100000,
        currency: "USD",
        idempotencyKey: "33333333-4444-5555-6666-777777777777",
      }),
    });

    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("PAYOUT_ACCOUNT_UNDER_REVIEW");
  });

  it("producer payout request fails if risk hold is open", async () => {
    mockDb.set("producers/prod_safety_test", {
      planStatus: "ACTIVE",
      verificationStatus: "APPROVED",
      earningsBalanceByCurrency: { USD: 1000000 },
      payoutHold: true, // Safety hold active!
    });

    const { Route } = await import("@/routes/api/public/v1/producer/payouts/request");
    const handler = (Route as any).options.server.handlers.POST;

    const req = new Request("http://localhost/api/public/v1/producer/payouts/request", {
      method: "POST",
      headers: { authorization: "Bearer producer_token", "content-type": "application/json" },
      body: JSON.stringify({
        amountMinor: 100000,
        currency: "USD",
        idempotencyKey: "44444444-5555-6666-7777-888888888888",
      }),
    });

    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("PAYOUT_HELD_RISK");
  });

  it("successful payout request snapshots account details and reserves balance", async () => {
    const { Route } = await import("@/routes/api/public/v1/producer/payouts/request");
    const handler = (Route as any).options.server.handlers.POST;

    const req = new Request("http://localhost/api/public/v1/producer/payouts/request", {
      method: "POST",
      headers: { authorization: "Bearer producer_token", "content-type": "application/json" },
      body: JSON.stringify({
        amountMinor: 100000, // $1,000.00
        currency: "USD",
        idempotencyKey: "55555555-6666-7777-8888-999999999999",
      }),
    });

    const res = await handler({ request: req });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe("REQUESTED");
    expect(data.amountMinor).toBe(100000);

    // Verify payout document in database has snapshot
    const payoutDoc = mockDb.get(`payouts/${data.payoutId}`);
    expect(payoutDoc.payoutAccount).toBeDefined();
    expect(payoutDoc.payoutAccount.beneficiaryName).toBe("Safety Producer");
    expect(payoutDoc.payoutAccount.accountNumberMasked).toBe("******1234");
  });

  it("enforces dual approval for payouts >= $5,000 with two different reviewers", async () => {
    const highValuePayoutId = "po_9999888877776666555544443333222211110000aaaabbbbccccddddeeeeffff";
    mockDb.set(`payouts/${highValuePayoutId}`, {
      uid: "prod_safety_test",
      amountMinor: 600000, // $6,000.00 (Exceeds $5,000 dual approval threshold)
      currency: "USD",
      status: "REQUESTED",
    });

    const { Route } = await import("@/routes/api/public/v1/zillionaire/payouts/$payoutId/review");
    const handler = (Route as any).options.server.handlers.POST;

    // Stage 1: First Reviewer approves -> Moves to PENDING_SECOND_APPROVAL
    const reqStage1 = new Request(`http://localhost/api/public/v1/zillionaire/payouts/${highValuePayoutId}/review`, {
      method: "POST",
      headers: { authorization: "Bearer owner_token", "content-type": "application/json" },
      body: JSON.stringify({
        decision: "APPROVE",
        reason: "Initial compliance approval verified",
      }),
    });

    const resStage1 = await handler({ request: reqStage1, params: { payoutId: highValuePayoutId } });
    expect(resStage1.status).toBe(200);
    const dataStage1 = await resStage1.json();
    expect(dataStage1.status).toBe("PENDING_SECOND_APPROVAL");

    const payoutStage1 = mockDb.get(`payouts/${highValuePayoutId}`);
    expect(payoutStage1.status).toBe("PENDING_SECOND_APPROVAL");
    expect(payoutStage1.firstReviewerUid).toBe("owner_b4");

    // Stage 2 Attempt: Same reviewer cannot perform second approval (403)
    const reqStage2Same = new Request(`http://localhost/api/public/v1/zillionaire/payouts/${highValuePayoutId}/review`, {
      method: "POST",
      headers: { authorization: "Bearer owner_token", "content-type": "application/json" },
      body: JSON.stringify({
        decision: "APPROVE",
        reason: "Attempting second approval with same user",
      }),
    });

    const resStage2Same = await handler({ request: reqStage2Same, params: { payoutId: highValuePayoutId } });
    expect(resStage2Same.status).toBe(403);
    const dataStage2Same = await resStage2Same.json();
    expect(dataStage2Same.code).toBe("DUAL_APPROVAL_SAME_REVIEWER");

    // Stage 2 Success: Different reviewer authorizes final approval -> APPROVED
    const reqStage2Diff = new Request(`http://localhost/api/public/v1/zillionaire/payouts/${highValuePayoutId}/review`, {
      method: "POST",
      headers: { authorization: "Bearer reviewer_2_token", "content-type": "application/json" },
      body: JSON.stringify({
        decision: "APPROVE",
        reason: "Second finance officer dual sign-off confirmed",
      }),
    });

    const resStage2Diff = await handler({ request: reqStage2Diff, params: { payoutId: highValuePayoutId } });
    expect(resStage2Diff.status).toBe(200);
    const dataStage2Diff = await resStage2Diff.json();
    expect(dataStage2Diff.status).toBe("APPROVED");

    const finalPayout = mockDb.get(`payouts/${highValuePayoutId}`);
    expect(finalPayout.status).toBe("APPROVED");
    expect(finalPayout.secondReviewerUid).toBe("reviewer_2");
  });
});
