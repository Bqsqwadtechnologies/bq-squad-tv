import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Route as FinanceRoute } from "@/routes/api/public/v1/zillionaire/finance";
import { Firestore } from "@/lib/server/firebase-admin";
import * as apiModule from "@/lib/server/api";
import * as rolesModule from "@/lib/server/roles";
import * as auditModule from "@/lib/server/audit";

function createMemoryFirestore() {
  const storedDocs: Record<string, Record<string, unknown>> = {};
  const queries: Array<{ collectionId: string; options: unknown }> = [];

  const fs = {
    docName: (path: string) => `projects/test-project/databases/(default)/documents/${path}`,
    getDoc: vi.fn(async (path: string) => {
      return storedDocs[path] ? { ...storedDocs[path] } : null;
    }),
    setDoc: vi.fn(
      async (path: string, fields: Record<string, unknown>, opts?: { merge?: boolean }) => {
        if (opts?.merge && storedDocs[path]) {
          storedDocs[path] = { ...storedDocs[path], ...fields };
        } else {
          storedDocs[path] = { ...fields };
        }
      },
    ),
    patchDoc: vi.fn(async (path: string, fields: Record<string, unknown>) => {
      storedDocs[path] = { ...(storedDocs[path] || {}), ...fields };
    }),
    query: vi.fn(async (collectionId: string, options: unknown) => {
      queries.push({ collectionId, options });
      if (collectionId === "payments") {
        return [
          {
            __id: "pay_1",
            amountMinor: 1000000, // ₦10,000
            status: "COMPLETED",
            channelId: "ch-movies",
            createdAt: "2026-11-12T10:00:00.000Z",
          },
          {
            __id: "pay_2",
            amountMinor: 500000, // ₦5,000
            status: "COMPLETED",
            channelId: "direct",
            createdAt: "2026-11-13T10:00:00.000Z",
          },
        ];
      }
      if (collectionId === "wallets") {
        return [
          { __id: "w_1", balanceMinor: 250000 },
          { __id: "w_2", balanceMinor: 150000 },
        ];
      }
      if (collectionId === "channels") {
        return [{ __id: "ch-movies", title: "BQ Movies Deluxe" }];
      }
      return [];
    }),
  } as unknown as Firestore;

  return { fs, storedDocs, queries };
}

describe("Zillionaire Finance Control API", () => {
  let memFs: ReturnType<typeof createMemoryFirestore>;

  beforeEach(() => {
    memFs = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(memFs.fs);
    vi.spyOn(auditModule, "writeAuditLog").mockResolvedValue({
      id: "audit_123",
      hash: "abc",
      prevHash: "prev",
      timestamp: new Date().toISOString(),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calculates revenue splits, channel breakdown, and wallet liabilities on GET", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "usr_owner_1",
      email: "owner@bqsqwad.tv",
      token: "fake-token",
    } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(undefined as any);

    const handler = (FinanceRoute as any).options?.server?.handlers?.GET;
    expect(handler).toBeDefined();

    const req = new Request("https://bqsqwad.tv/api/public/v1/zillionaire/finance?range=30d", {
      headers: { Authorization: "Bearer fake-token" },
    });

    const res: Response = await handler({ request: req });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.metrics).toBeDefined();

    // pay_1 (10,000 NGN) is on channel: 7,000 producer, 3,000 platform
    // pay_2 (5,000 NGN) is direct: 0 producer, 5,000 platform
    // total gross = 15,000 NGN (1,500,000 minor)
    expect(json.metrics.grossRevenueMinor).toBe(1500000);
    expect(json.metrics.producerShareMinor).toBe(700000);
    expect(json.metrics.platformShareMinor).toBe(800000);

    // wallet liability: 250,000 + 150,000 = 400,000 minor
    expect(json.metrics.walletLiabilityMinor).toBe(400000);

    // Verify channel item
    const chItem = json.revenueByChannel.find((c: any) => c.channelId === "ch-movies");
    expect(chItem).toBeDefined();
    expect(chItem.grossMinor).toBe(1000000);
    expect(chItem.producerMinor).toBe(700000);
    expect(chItem.platformMinor).toBe(300000);
  });

  it("locks a financial period with audit reason via POST", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "usr_owner_1",
      email: "owner@bqsqwad.tv",
    } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(undefined as any);

    const handler = (FinanceRoute as any).options?.server?.handlers?.POST;
    expect(handler).toBeDefined();

    const req = new Request("https://bqsqwad.tv/api/public/v1/zillionaire/finance", {
      method: "POST",
      headers: {
        Authorization: "Bearer fake-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "LOCK_PERIOD",
        period: "2026-11",
        reason: "November books certified by external auditor",
      }),
    });

    const res: Response = await handler({ request: req });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.period.period).toBe("2026-11");
    expect(json.period.status).toBe("LOCKED");
    expect(memFs.storedDocs["financialPeriods/2026-11"]).toBeDefined();
    expect(auditModule.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "finance.lock_period",
        targetId: "2026-11",
      }),
    );
  });

  it("appends chargeback dispute notes with audit logging", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "usr_owner_1",
    } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(undefined as any);

    memFs.storedDocs["reconciliationExceptions/exc_99"] = {
      chargebackNotes: [],
    };

    const handler = (FinanceRoute as any).options?.server?.handlers?.POST;
    const req = new Request("https://bqsqwad.tv/api/public/v1/zillionaire/finance", {
      method: "POST",
      headers: {
        Authorization: "Bearer fake-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "ADD_CHARGEBACK_NOTE",
        paymentId: "exc_99",
        note: "Submitted proof of live streaming delivery to acquiring bank",
        reason: "Bank request for evidence",
      }),
    });

    const res: Response = await handler({ request: req });
    expect(res.status).toBe(200);

    const updated = memFs.storedDocs["reconciliationExceptions/exc_99"];
    expect(updated.chargebackNotes).toHaveLength(1);
    expect(auditModule.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "finance.add_chargeback_note",
        targetId: "exc_99",
      }),
    );
  });

  it("issues audited refunds and posts ledger reversal entry", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "usr_owner_1",
    } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(undefined as any);

    memFs.storedDocs["payments/pay_test_01"] = {
      uid: "usr_refund_target",
      amountMinor: 350000,
    };

    const handler = (FinanceRoute as any).options?.server?.handlers?.POST;
    const req = new Request("https://bqsqwad.tv/api/public/v1/zillionaire/finance", {
      method: "POST",
      headers: {
        Authorization: "Bearer fake-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "ISSUE_REFUND",
        paymentId: "pay_test_01",
        amountMinor: 350000,
        reason: "Customer was charged twice due to bank retry timeout",
      }),
    });

    const res: Response = await handler({ request: req });
    expect(res.status).toBe(200);

    const payment = memFs.storedDocs["payments/pay_test_01"];
    expect(payment.reversed).toBe(true);

    // Verify ledger reversal entry was created
    const ledgerKey = Object.keys(memFs.storedDocs).find((k) => k.startsWith("ledger/"));
    expect(ledgerKey).toBeDefined();
    expect(memFs.storedDocs[ledgerKey!].amountMinor).toBe(-350000);
    expect(memFs.storedDocs[ledgerKey!].kind).toBe("refund");
  });

  it("dismisses anomaly flags with mandatory reason", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "usr_owner_1",
    } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(undefined as any);

    memFs.storedDocs["financeAnomalies/anom_test_1"] = {
      status: "OPEN",
    };

    const handler = (FinanceRoute as any).options?.server?.handlers?.POST;
    const req = new Request("https://bqsqwad.tv/api/public/v1/zillionaire/finance", {
      method: "POST",
      headers: {
        Authorization: "Bearer fake-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "DISMISS_ANOMALY",
        anomalyId: "anom_test_1",
        reason: "Verified legitimate corporate top-up event with customer support",
      }),
    });

    const res: Response = await handler({ request: req });
    expect(res.status).toBe(200);

    const anom = memFs.storedDocs["financeAnomalies/anom_test_1"];
    expect(anom.status).toBe("DISMISSED");
    expect(anom.dismissedReason).toBe(
      "Verified legitimate corporate top-up event with customer support",
    );
  });
});
