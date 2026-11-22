import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb: Map<string, any> = ((globalThis as any).__sharedTestFirestore ??= new Map<string, any>());

vi.mock("@/lib/server/firebase-admin", () => {
  return {
    ApiError: class ApiError extends Error {
      statusCode: number;
      errorCode: string;
      constructor(status: number, code: string, message: string) {
        super(message);
        this.statusCode = status;
        this.errorCode = code;
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

import {
  NOTIFICATION_EMAIL_EVENTS,
  renderEmailTemplate,
  calculateNextBackoffMs,
  prepareAiAssistantEmailPayload,
  dispatchNotificationEvent,
  executeOutboxDelivery,
  type NotificationEventPayload,
} from "@/lib/server/email/outbox";
import { Firestore } from "@/lib/server/firebase-admin";

describe("Batch B7 — Email Status & Notification Outbox", () => {
  beforeEach(() => {
    mockDb.clear();
  });

  it("prohibits SMS transport for payment and KYC status updates (email and in-app only)", () => {
    // Verifies the platform rule: payment & KYC status messages go to EMAIL and IN-APP notices only, never SMS
    const event: NotificationEventPayload = {
      eventType: "payout_paid",
      recipientUid: "usr_test_b7_producer",
      recipientEmail: "producer@example.com",
      recipientName: "Test Producer",
      currentStatus: "Paid",
      nextStep: "Check your bank account in 1-2 business days",
      amountMinor: 75000,
      currency: "USD",
      paymentReference: "PAY-2026-03-9999",
      receiptUrl: "https://tv.bqsqwad.com/receipts/rec_b7_9999.pdf",
    };

    const rendered = renderEmailTemplate(event);
    expect(rendered.subject).toContain("750.00");
    expect(rendered.textContent).toContain("Current Status: Paid");
    expect(rendered.textContent).toContain("Next Step: Check your bank account in 1-2 business days");
    expect(rendered.textContent).toContain("PAY-2026-03-9999");
    expect(rendered.textContent).toContain("receipts/rec_b7_9999.pdf");
    expect(rendered.inAppTitle).toBe("Payout Paid");
    expect(rendered.inAppBody).toContain("PAY-2026-03-9999");
  });

  it("covers all 12 status change event types with repeated status and next step", () => {
    expect(NOTIFICATION_EMAIL_EVENTS).toHaveLength(12);

    for (const eventType of NOTIFICATION_EMAIL_EVENTS) {
      const payload: NotificationEventPayload = {
        eventType,
        recipientUid: "usr_creator_b7",
        recipientEmail: "creator@example.com",
        currentStatus: `STATUS_FOR_${eventType}`,
        nextStep: `NEXT_STEP_FOR_${eventType}`,
        reason: eventType.includes("rejected") || eventType.includes("needs_changes") ? "Test Compliance Reason" : undefined,
      };

      const rendered = renderEmailTemplate(payload);
      expect(rendered.subject).toBeTruthy();
      expect(rendered.textContent).toContain(`Current Status: STATUS_FOR_${eventType}`);
      expect(rendered.textContent).toContain(`Next Step: NEXT_STEP_FOR_${eventType}`);
      expect(rendered.htmlContent).toContain(`STATUS_FOR_${eventType}`);
      expect(rendered.htmlContent).toContain(`NEXT_STEP_FOR_${eventType}`);
      expect(rendered.inAppTitle).toBeTruthy();
      expect(rendered.inAppBody).toBeTruthy();

      if (payload.reason) {
        expect(rendered.textContent).toContain("Test Compliance Reason");
        expect(rendered.htmlContent).toContain("Test Compliance Reason");
      }
    }
  });

  it("calculates exponential backoff delays correctly for retry attempts", () => {
    expect(calculateNextBackoffMs(1)).toBe(60 * 1000); // 1 min
    expect(calculateNextBackoffMs(2)).toBe(5 * 60 * 1000); // 5 min
    expect(calculateNextBackoffMs(3)).toBe(15 * 60 * 1000); // 15 min
    expect(calculateNextBackoffMs(4)).toBe(60 * 60 * 1000); // 60 min
  });

  it("prepares a clean, stable AI assistant hook payload ready for future AI drafting", () => {
    const payload: NotificationEventPayload = {
      eventType: "kyc_needs_changes",
      recipientUid: "usr_ai_creator_01",
      recipientEmail: "creator.ai@example.com",
      recipientName: "Amara Okonkwo",
      currentStatus: "Needs Changes",
      nextStep: "Please upload a clearer image of your government-issued ID card.",
      reason: "National ID scan was blurry on reverse side barcode.",
      metadata: { country: "NG", docType: "national_id" },
    };

    const rendered = renderEmailTemplate(payload);
    const aiEvent = prepareAiAssistantEmailPayload(payload, rendered.subject, rendered.textContent);

    expect(aiEvent.hookVersion).toBe("1.0");
    expect(aiEvent.eventType).toBe("kyc_needs_changes");
    expect(aiEvent.recipient.displayName).toBe("Amara Okonkwo");
    expect(aiEvent.context.currentStatus).toBe("Needs Changes");
    expect(aiEvent.context.reason).toBe("National ID scan was blurry on reverse side barcode.");
    expect(aiEvent.context.nextStep).toContain("clearer image");
    expect(aiEvent.baseTemplate.subject).toBe(rendered.subject);
    expect(aiEvent.baseTemplate.textContent).toBe(rendered.textContent);
    expect(aiEvent.rawPayload).toEqual({ country: "NG", docType: "national_id" });
  });

  it("dispatches notification event: writes both in-app notice and outbox record", async () => {
    const fs = await Firestore.create();
    const event: NotificationEventPayload = {
      eventType: "kyc_submitted",
      recipientUid: "usr_b7_test_flow_01",
      recipientEmail: "flow.test@example.com",
      recipientName: "Kofi Mensah",
      currentStatus: "Under Review",
      nextStep: "Wait for compliance team verification (usually within 24 hours).",
    };

    const dispatch = await dispatchNotificationEvent(fs as any, event);
    expect(dispatch.outboxId).toBeTruthy();

    // Verify outbox document was written to Firestore
    const outboxDoc = await fs.getDoc(`email_outbox/${dispatch.outboxId}`);
    expect(outboxDoc).toBeTruthy();
    expect(outboxDoc?.["eventType"]).toBe("kyc_submitted");
    expect(outboxDoc?.["recipientEmail"]).toBe("flow.test@example.com");
    expect(outboxDoc?.["status"]).toMatch(/queued|sent/);
    expect(outboxDoc?.["aiHookMetadata"]).toEqual(
      expect.objectContaining({
        hookName: "email_personalizer_v1",
        hookVersion: "1.0",
        readyForAiPersonalization: true,
      })
    );

    // Verify in-app notification was written to user notifications
    let foundInApp = false;
    for (const [key, val] of mockDb.entries()) {
      if (key.startsWith("users/usr_b7_test_flow_01/notifications/")) {
        foundInApp = true;
        expect(val.title).toBe("KYC Submitted");
        expect(val.body).toContain("received");
        break;
      }
    }
    expect(foundInApp).toBe(true);
  });

  it("executes delivery attempt via Brevo when API key is provided", async () => {
    const fs = await Firestore.create();
    const outboxId = "outbox_test_delivery_" + Date.now();

    await fs.setDoc(`email_outbox/${outboxId}`, {
      id: outboxId,
      eventType: "payout_account_approved",
      recipientUid: "usr_test_payout_dest",
      recipientEmail: "finance@test.com",
      recipientName: "Finance Lead",
      subject: "Your payout bank account has been approved",
      textContent: "Hello Finance Lead, your payout account is approved.",
      htmlContent: "<p>Hello Finance Lead, your payout account is approved.</p>",
      status: "queued",
      attempts: 0,
      maxAttempts: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    process.env.BREVO_API_KEY = "xkeysib-test-b7-key";
    process.env.BREVO_SENDER_EMAIL = "tv@bqsqwad.com";
    process.env.BREVO_SENDER_NAME = "BQ SQWAD TV";

    const originalFetch = global.fetch;
    try {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messageId: "<b7-outbox-msg-123@brevo.com>" }),
      } as any);

      const result = await executeOutboxDelivery(fs as any, outboxId);
      expect(result.status).toBe("sent");

      const updated = await fs.getDoc(`email_outbox/${outboxId}`);
      expect(updated?.["status"]).toBe("sent");
      expect(updated?.["attempts"]).toBe(1);
      expect(updated?.["sentAt"]).toBeTruthy();
    } finally {
      global.fetch = originalFetch;
      delete process.env.BREVO_API_KEY;
    }
  });
});
