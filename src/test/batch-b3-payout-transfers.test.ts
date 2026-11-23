import { describe, it, expect, vi, beforeEach } from "vitest";
import * as apiModule from "@/lib/server/api";
import { encryptSensitiveField } from "@/lib/server/kyc/types";

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

describe("Batch B3 — Owner Payout Sheet, Transfer Details, Batch Export, and Settle Flow", () => {
  beforeEach(() => {
    mockDb.clear();
    process.env["KYC_VAULT_SIGNING_SECRET"] = "super-secret-vault-signing-key-32-bytes-minimum-length!";
    process.env["KYC_FIELD_ENCRYPTION_KEY"] = Buffer.alloc(32, 9).toString("base64");
    process.env["ZILLIONAIRE_EMAIL"] = "owner@bqsqwad.tv";

    // Setup owner
    mockDb.set("users/owner_b3", {
      uid: "owner_b3",
      email: "owner@bqsqwad.tv",
      appEmailVerified: true,
      emailVerified: true,
    });
    mockDb.set("zillionaireModules/owner_b3", {
      payouts: true,
      finance: true,
    });

    // Setup unauthorized user
    mockDb.set("users/viewer_unauth", {
      uid: "viewer_unauth",
      email: "viewer@example.com",
      appEmailVerified: true,
    });

    vi.spyOn(apiModule, "requireUser").mockImplementation(async (req: Request) => {
      const auth = req.headers.get("authorization");
      if (!auth) {
        const { ApiError } = await import("@/lib/server/firebase-admin");
        throw new ApiError(401, "UNAUTHENTICATED", "A sign-in token is required.");
      }
      const token = auth.replace(/^Bearer\s+/i, "");
      if (token === "owner_token") {
        return {
          uid: "owner_b3",
          email: "owner@bqsqwad.tv",
          emailVerified: true,
          customClaims: {},
        } as any;
      }
      if (token === "unauth_token") {
        return {
          uid: "viewer_unauth",
          email: "viewer@example.com",
          emailVerified: true,
          customClaims: {},
        } as any;
      }
      throw new Error("Invalid token in test");
    });
  });

  it("blocks non-zillionaire users from viewing transfer details (403)", async () => {
    const { Route } = await import("@/routes/api/public/v1/zillionaire/payouts/$payoutId/transfer-details");
    const handler = (Route as any).options.server.handlers.GET;

    const req = new Request("http://localhost/api/public/v1/zillionaire/payouts/po_test123/transfer-details", {
      headers: { authorization: "Bearer unauth_token" },
    });

    const res = await handler({ request: req, params: { payoutId: "po_test123" } });
    expect(res.status).toBe(403);
  });

  it("returns unmasked transfer details in exact ALAT/wire order with fees note and reference, and records audit", async () => {
    const rawAccount = "0123456789";
    const encAccount = encryptSensitiveField(rawAccount);

    // Seed producer, KYC and payout profile
    mockDb.set("kycProfiles/prod_local_ng", {
      legalName: "Chidi Nnamdi Okafor",
      residentialAddress: "14 Admiralty Way, Lekki Phase 1, Lagos",
      country: "NG",
    });

    mockDb.set("payoutProfiles/prod_local_ng", {
      uid: "prod_local_ng",
      beneficiaryName: "Chidi Nnamdi Okafor",
      beneficiaryAddress: "14 Admiralty Way, Lekki Phase 1, Lagos",
      bankName: "Wema Bank",
      bankAddress: "54 Marina, Lagos Island",
      accountNumberEncrypted: JSON.stringify(encAccount),
      accountNumberMasked: "******6789",
      swiftBic: "WEMANGLA",
      routingCode: "035150103",
      country: "NG",
      currency: "NGN",
    });

    mockDb.set("payouts/po_abc1234567890", {
      __id: "po_abc1234567890",
      uid: "prod_local_ng",
      amountMinor: 75000000, // 750,000 NGN
      currency: "NGN",
      status: "APPROVED",
      createdAt: "2026-11-20T10:00:00Z",
    });

    const { Route } = await import("@/routes/api/public/v1/zillionaire/payouts/$payoutId/transfer-details");
    const handler = (Route as any).options.server.handlers.GET;

    const req = new Request("http://localhost/api/public/v1/zillionaire/payouts/po_abc1234567890/transfer-details", {
      headers: { authorization: "Bearer owner_token" },
    });

    const res = await handler({ request: req, params: { payoutId: "po_abc1234567890" } });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.payoutId).toBe("po_abc1234567890");
    expect(data.details.beneficiaryName).toBe("Chidi Nnamdi Okafor");
    expect(data.details.accountNumber).toBe("0123456789"); // Unmasked for owner!
    expect(data.details.bankName).toBe("Wema Bank");
    expect(data.details.feesNote).toBe("Standard local transfer zero-fee settlement");
    expect(data.transferReference).toMatch(/^BQS-PAY-/);
    expect(data.orderedFields).toHaveLength(11);
    expect(data.orderedFields[0].label).toContain("Beneficiary Full Legal Name");
    expect(data.orderedFields[1].label).toContain("Account Number / IBAN");
    expect(data.orderedFields[1].value).toBe("0123456789");

    // Verify audit log
    const auditEntries = Array.from(mockDb.entries()).filter(([k, v]) =>
      k.startsWith("auditLog/") && v.action === "payout.transfer_details.viewed"
    );
    expect(auditEntries.length).toBeGreaterThan(0);
    expect(auditEntries[0]?.[1].targetId).toBe("po_abc1234567890");
  });

  it("audits one-tap copying of transfer fields", async () => {
    mockDb.set("payouts/po_abc1234567890", {
      uid: "prod_local_ng",
      currency: "NGN",
    });

    const { Route } = await import("@/routes/api/public/v1/zillionaire/payouts/$payoutId/audit-copy");
    const handler = (Route as any).options.server.handlers.POST;

    const req = new Request("http://localhost/api/public/v1/zillionaire/payouts/po_abc1234567890/audit-copy", {
      method: "POST",
      headers: {
        authorization: "Bearer owner_token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ field: "accountNumber" }),
    });

    const res = await handler({ request: req, params: { payoutId: "po_abc1234567890" } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    const auditEntries = Array.from(mockDb.entries()).filter(([k, v]) =>
      k.startsWith("auditLog/") && v.action === "payout.transfer_details.copied"
    );
    expect(auditEntries.length).toBeGreaterThan(0);
    expect(auditEntries[0]?.[1].metadata.field).toBe("accountNumber");
  });

  it("exports batch CSV grouped by Local and International with unmasked accounts and records audit", async () => {
    const rawLocal = "0123456789";
    const rawIntl = "GB89WEST12345698765432";
    const encLocal = encryptSensitiveField(rawLocal);
    const encIntl = encryptSensitiveField(rawIntl);

    // Local NG payout
    mockDb.set("payoutProfiles/user_ng", {
      beneficiaryName: "Local Creator Ltd",
      bankName: "Wema Bank",
      accountNumberEncrypted: JSON.stringify(encLocal),
      country: "NG",
      currency: "NGN",
    });
    mockDb.set("payouts/po_local_111111", {
      uid: "user_ng",
      amountMinor: 10000000,
      currency: "NGN",
      status: "APPROVED",
    });

    // International UK payout
    mockDb.set("payoutProfiles/user_uk", {
      beneficiaryName: "British Indie Film Studio",
      bankName: "Barclays Bank UK",
      accountNumberEncrypted: JSON.stringify(encIntl),
      swiftBic: "BARCGB22",
      country: "GB",
      currency: "USD",
    });
    mockDb.set("payouts/po_intl_222222", {
      uid: "user_uk",
      amountMinor: 250000, // $2,500.00
      currency: "USD",
      status: "APPROVED",
    });

    const { Route } = await import("@/routes/api/public/v1/zillionaire/payouts/export");
    const handler = (Route as any).options.server.handlers.POST;

    // Test Local Export
    const reqLocal = new Request("http://localhost/api/public/v1/zillionaire/payouts/export", {
      method: "POST",
      headers: { authorization: "Bearer owner_token", "content-type": "application/json" },
      body: JSON.stringify({ group: "LOCAL" }),
    });

    const resLocal = await handler({ request: reqLocal });
    expect(resLocal.status).toBe(200);
    const dataLocal = await resLocal.json();
    expect(dataLocal.totalExported).toBe(1);
    expect(dataLocal.csv).toContain("Local Creator Ltd");
    expect(dataLocal.csv).toContain("0123456789");
    expect(dataLocal.csv).not.toContain("British Indie Film Studio");

    // Test International Export
    const reqIntl = new Request("http://localhost/api/public/v1/zillionaire/payouts/export", {
      method: "POST",
      headers: { authorization: "Bearer owner_token", "content-type": "application/json" },
      body: JSON.stringify({ group: "INTERNATIONAL" }),
    });

    const resIntl = await handler({ request: reqIntl });
    expect(resIntl.status).toBe(200);
    const dataIntl = await resIntl.json();
    expect(dataIntl.totalExported).toBe(1);
    expect(dataIntl.csv).toContain("British Indie Film Studio");
    expect(dataIntl.csv).toContain("GB89WEST12345698765432");

    // Verify audit log
    const auditEntries = Array.from(mockDb.entries()).filter(([k, v]) =>
      k.startsWith("auditLog/") && v.action === "payout.batch_export"
    );
    expect(auditEntries.length).toBeGreaterThanOrEqual(2);
  });

  it("marks approved payout as PAID with ALAT/bank reference and receipt, notifying in-app and email (never SMS)", async () => {
    const payoutId = "po_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    mockDb.set(`payouts/${payoutId}`, {
      uid: "prod_paid_recipient",
      amountMinor: 50000000,
      currency: "NGN",
      status: "APPROVED",
    });
    mockDb.set("producers/prod_paid_recipient", {
      payoutReservedByCurrency: { NGN: 50000000 },
    });

    const { Route } = await import("@/routes/api/public/v1/zillionaire/payouts/$payoutId/settle");
    const handler = (Route as any).options.server.handlers.POST;

    const req = new Request(`http://localhost/api/public/v1/zillionaire/payouts/${payoutId}/settle`, {
      method: "POST",
      headers: { authorization: "Bearer owner_token", "content-type": "application/json" },
      body: JSON.stringify({
        action: "PAID",
        settlementReference: "WEMA-ALAT-20261120-89129",
        paidAmountMinor: 50000000,
        paymentDate: "2026-11-20T12:00:00.000Z",
        reason: "Monthly creator earnings settled via ALAT wire transfer",
        receiptPath: "receipts/alat_confirmation_nov2026.pdf",
      }),
    });

    const res = await handler({ request: req, params: { payoutId } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe("SETTLED");
    expect(data.settlementReference).toBe("WEMA-ALAT-20261120-89129");

    // Verify payout updated in database
    const updatedPayout = mockDb.get(`payouts/${payoutId}`);
    expect(updatedPayout.status).toBe("SETTLED");
    expect(updatedPayout.receiptPath).toBe("receipts/alat_confirmation_nov2026.pdf");

    // Verify In-App Notification created
    const notifs = Array.from(mockDb.entries()).filter(([k]) => k.startsWith("notifications/"));
    expect(notifs.length).toBeGreaterThan(0);
    const inApp = notifs[0]?.[1];
    expect(inApp.recipientUid).toBe("prod_paid_recipient");
    expect(inApp.title).toContain("Payout Processed");
    expect(inApp.metadata.reference).toBe("WEMA-ALAT-20261120-89129");

    // Verify Email Outbox queued (Strictly email, never SMS)
    const outboxes = Array.from(mockDb.entries()).filter(([k]) => k.startsWith("emailOutbox/"));
    expect(outboxes.length).toBeGreaterThan(0);
    const emailNotice = outboxes[0]?.[1];
    expect(emailNotice.channel).toBe("email");
    expect(emailNotice.recipientUid).toBe("prod_paid_recipient");
    expect(emailNotice.variables.reference).toBe("WEMA-ALAT-20261120-89129");

    // Strictly ensure no SMS records exist
    const smsRecords = Array.from(mockDb.keys()).filter((k) => k.toLowerCase().includes("sms"));
    expect(smsRecords).toHaveLength(0);
  });

  it("moves failed or returned transfer back to HELD with reason and preserves reserves", async () => {
    const payoutId = "po_111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000";
    mockDb.set(`payouts/${payoutId}`, {
      uid: "prod_return_test",
      amountMinor: 30000000,
      currency: "NGN",
      status: "APPROVED",
    });
    mockDb.set("producers/prod_return_test", {
      payoutReservedByCurrency: { NGN: 30000000 },
    });

    const { Route } = await import("@/routes/api/public/v1/zillionaire/payouts/$payoutId/settle");
    const handler = (Route as any).options.server.handlers.POST;

    const req = new Request(`http://localhost/api/public/v1/zillionaire/payouts/${payoutId}/settle`, {
      method: "POST",
      headers: { authorization: "Bearer owner_token", "content-type": "application/json" },
      body: JSON.stringify({
        action: "RETURN",
        settlementReference: "RECALL-20261120-001",
        reason: "Bank returned wire due to account name inquiry discrepancy",
      }),
    });

    const res = await handler({ request: req, params: { payoutId } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe("HELD");
    expect(data.holdReason).toBe("Bank returned wire due to account name inquiry discrepancy");

    const updatedPayout = mockDb.get(`payouts/${payoutId}`);
    expect(updatedPayout.status).toBe("HELD");

    // Reserved balance must still be intact so funds are safe
    const producer = mockDb.get("producers/prod_return_test");
    expect(producer.payoutReservedByCurrency.NGN).toBe(30000000);
  });
});
