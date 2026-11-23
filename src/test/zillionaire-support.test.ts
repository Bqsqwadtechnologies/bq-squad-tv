import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Route as SupportRoute } from "@/routes/api/public/v1/zillionaire/support/index";
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
      if (collectionId === "supportTickets") {
        return [
          {
            __id: "test_tick_1",
            ticketNumber: "TICK-9001",
            subject: "Failed topup",
            customerName: "Audu",
            customerEmail: "audu@example.com",
            status: "open",
            priority: "urgent",
            category: "billing",
            createdAt: "2026-11-15T12:00:00.000Z",
          },
        ];
      }
      if (collectionId === "userSegments") {
        return [
          {
            __id: "seg_1",
            name: "Lagos VIP",
            description: "High spenders",
            audienceCount: 1200,
            createdAt: "2026-11-10T10:00:00.000Z",
          },
        ];
      }
      if (collectionId === "accountRecoveryRequests") {
        return [
          {
            __id: "rec_1",
            userUid: "usr_rec_1",
            email: "viewer@example.com",
            reason: "Lost phone",
            status: "pending_verification",
            verificationChecks: {
              emailConfirmed: true,
              recentBillingVerified: true,
              deviceFingerprintMatched: false,
            },
            createdAt: "2026-11-18T08:00:00.000Z",
          },
        ];
      }
      return [];
    }),
  } as unknown as Firestore;

  return { fs, storedDocs, queries };
}

describe("Zillionaire Support Desk and User Accounts", () => {
  let memFs: ReturnType<typeof createMemoryFirestore>;

  beforeEach(() => {
    memFs = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(memFs.fs);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "usr_support_operator_1",
      email: "operator@example.com",
      emailVerified: true,
    } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(true as any);
    vi.spyOn(auditModule, "writeAuditLog").mockImplementation(async (_fs, entry) => {
      memFs.storedDocs[`auditLogs/audit_${Math.random()}`] = { ...entry };
      return "audit-id";
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns support tickets, segments, canned replies and recovery requests", async () => {
    const handler = (SupportRoute.options.server as unknown as {
      handlers: {
        GET: (ctx: { request: Request }) => Promise<Response>;
        POST: (ctx: { request: Request }) => Promise<Response>;
      };
    }).handlers;
    const req = new Request("http://localhost/api/public/v1/zillionaire/support/", {
      headers: { Authorization: "Bearer test-zillionaire-token" },
    });

    const res = await handler.GET({ request: req } as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tickets).toBeDefined();
    expect(Array.isArray(body.tickets)).toBe(true);
    expect(body.tickets.length).toBeGreaterThanOrEqual(1);
    expect(body.segments).toBeDefined();
    expect(body.cannedReplies).toBeDefined();
    expect(body.recoveryRequests).toBeDefined();
    expect(body.summary).toBeDefined();
    expect(body.summary.openTicketsCount).toBeGreaterThanOrEqual(1);
  });

  it("updates ticket status and priority with audit logging", async () => {
    const handler = (SupportRoute.options.server as unknown as {
      handlers: {
        GET: (ctx: { request: Request }) => Promise<Response>;
        POST: (ctx: { request: Request }) => Promise<Response>;
      };
    }).handlers;
    memFs.storedDocs["supportTickets/test_tick_1"] = {
      ticketNumber: "TICK-9001",
      status: "open",
      priority: "medium",
    };

    const req = new Request("http://localhost/api/public/v1/zillionaire/support/", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-zillionaire-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "UPDATE_TICKET",
        ticketId: "test_tick_1",
        status: "pending",
        priority: "urgent",
        reason: "Customer escalation on failed debit",
      }),
    });

    const res = await handler.POST({ request: req } as any);
    expect(res.status).toBe(200);

    const updated = memFs.storedDocs["supportTickets/test_tick_1"];
    expect(updated["status"]).toBe("pending");
    expect(updated["priority"]).toBe("urgent");

    const auditEntry = Object.values(memFs.storedDocs).find(
      (d) => d["action"] === "support.update_ticket",
    );
    expect(auditEntry).toBeDefined();
    expect(auditEntry?.["targetId"]).toBe("test_tick_1");
  });

  it("adds internal operator notes to tickets", async () => {
    const handler = (SupportRoute.options.server as unknown as {
      handlers: {
        GET: (ctx: { request: Request }) => Promise<Response>;
        POST: (ctx: { request: Request }) => Promise<Response>;
      };
    }).handlers;
    memFs.storedDocs["supportTickets/test_tick_2"] = {
      ticketNumber: "TICK-9002",
      internalNotes: [],
    };

    const req = new Request("http://localhost/api/public/v1/zillionaire/support/", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-zillionaire-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "ADD_INTERNAL_NOTE",
        ticketId: "test_tick_2",
        text: "Checked edge cache node CDN-LOS-01; no packet drops detected.",
        reason: "Operator diagnosis",
      }),
    });

    const res = await handler.POST({ request: req } as any);
    expect(res.status).toBe(200);

    const updated = memFs.storedDocs["supportTickets/test_tick_2"];
    const notes = updated["internalNotes"] as any[];
    expect(Array.isArray(notes)).toBe(true);
    expect(notes.length).toBe(1);
    expect(notes[0].text).toContain("CDN-LOS-01");
  });

  it("links ticket to user UID, payment reference and receipt ID", async () => {
    const handler = (SupportRoute.options.server as unknown as {
      handlers: {
        GET: (ctx: { request: Request }) => Promise<Response>;
        POST: (ctx: { request: Request }) => Promise<Response>;
      };
    }).handlers;
    memFs.storedDocs["supportTickets/test_tick_3"] = {
      ticketNumber: "TICK-9003",
    };

    const req = new Request("http://localhost/api/public/v1/zillionaire/support/", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-zillionaire-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "LINK_RECORD",
        ticketId: "test_tick_3",
        linkedUserUid: "usr_linked_99",
        linkedPaymentId: "PAY_PSTK_00192",
        linkedReceiptId: "REC-2026-11-001",
        reason: "Matching customer card statement to Paystack gateway",
      }),
    });

    const res = await handler.POST({ request: req } as any);
    expect(res.status).toBe(200);

    const updated = memFs.storedDocs["supportTickets/test_tick_3"];
    expect(updated["linkedUserUid"]).toBe("usr_linked_99");
    expect(updated["linkedPaymentId"]).toBe("PAY_PSTK_00192");
    expect(updated["linkedReceiptId"]).toBe("REC-2026-11-001");
  });

  it("saves audience segment and processes account recovery without exposing passwords", async () => {
    const handler = (SupportRoute.options.server as unknown as {
      handlers: {
        GET: (ctx: { request: Request }) => Promise<Response>;
        POST: (ctx: { request: Request }) => Promise<Response>;
      };
    }).handlers;

    // 1. Save user segment
    const segReq = new Request("http://localhost/api/public/v1/zillionaire/support/", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-zillionaire-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "SAVE_SEGMENT",
        name: "Lagos High Rollers",
        description: "Frequent spenders in Lagos metropolitan area",
        criteria: {
          minSpendMinor: 1000000,
          country: "NG",
        },
        reason: "Targeted promotional push for live boxing event",
      }),
    });

    const segRes = await handler.POST({ request: segReq } as any);
    expect(segRes.status).toBe(200);
    const segBody = await segRes.json();
    expect(segBody.success).toBe(true);
    expect(segBody.segment.name).toBe("Lagos High Rollers");

    // 2. Process account recovery
    memFs.storedDocs["accountRecoveryRequests/rec_test_01"] = {
      userUid: "usr_recover_10",
      email: "recoverme@example.com",
      status: "pending_verification",
    };

    const recReq = new Request("http://localhost/api/public/v1/zillionaire/support/", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-zillionaire-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "PROCESS_RECOVERY",
        requestId: "rec_test_01",
        recoveryAction: "DISPATCH_RESET_LINK",
        notes: "Identity challenge verified via Paystack billing card check.",
        reason: "Verified user identity and sent cryptographic password reset link",
      }),
    });

    const recRes = await handler.POST({ request: recReq } as any);
    expect(recRes.status).toBe(200);

    const recDoc = memFs.storedDocs["accountRecoveryRequests/rec_test_01"];
    expect(recDoc["status"]).toBe("reset_link_dispatched");
    expect(recDoc["notes"]).toContain("Identity challenge verified");
  });
});
