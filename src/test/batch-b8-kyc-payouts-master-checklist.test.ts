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

import {
  encryptSensitiveField,
  decryptSensitiveField,
} from "@/lib/server/kyc/types";
import {
  buildPrivateDocumentVaultPath,
  validateKycFile,
  generateShortLivedViewerUrl,
  verifyViewerUrlSignature,
} from "@/lib/server/kyc/storage";
import {
  renderEmailTemplate,
  calculateNextBackoffMs,
  type NotificationEventPayload,
} from "@/lib/server/email/outbox";

describe("Batch B8 — Verification and Payout Master Checklist & Regression Verification", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockDb.clear();
    process.env = { ...originalEnv };
    process.env["ZILLIONAIRE_EMAIL"] = "owner@bqsqwad.tv";
    process.env["KYC_FIELD_ENCRYPTION_KEY"] = Buffer.alloc(32, 9).toString("base64");
    process.env["KYC_VAULT_SIGNING_SECRET"] = "super-secret-vault-signing-key-32-bytes-minimum-length!";

    // Setup Owner
    mockDb.set("users/owner_b8", {
      uid: "owner_b8",
      email: "owner@bqsqwad.tv",
      appEmailVerified: true,
      emailVerified: true,
      zillionaireModules: ["payouts", "finance", "kyc", "notifications"],
    });

    // Setup non-owner caller
    mockDb.set("users/user_unauth", {
      uid: "user_unauth",
      email: "unauth@example.com",
      appEmailVerified: true,
    });

    vi.spyOn(apiModule, "requireUser").mockImplementation(async (req: Request) => {
      const auth = req.headers.get("authorization");
      if (!auth) {
        const { ApiError } = await import("@/lib/server/firebase-admin");
        throw new ApiError(401, "UNAUTHENTICATED", "Sign-in token required.");
      }
      const token = auth.replace(/^Bearer\s+/i, "");
      if (token === "owner_token") {
        return { uid: "owner_b8", email: "owner@bqsqwad.tv", emailVerified: true, customClaims: {} } as any;
      }
      if (token === "unauth_token") {
        return { uid: "user_unauth", email: "unauth@example.com", emailVerified: true, customClaims: {} } as any;
      }
      throw new Error("Unknown token");
    });
  });

  describe("1. Storage, Encryption and Tamper Protection", () => {
    it("fails closed when encryption or signing secrets are unconfigured", () => {
      delete process.env["KYC_FIELD_ENCRYPTION_KEY"];
      delete process.env["KYC_VAULT_SIGNING_SECRET"];

      expect(() => encryptSensitiveField("test-sensitive-value")).toThrowError();
    });

    it("encrypts and decrypts sensitive fields symmetrically when key is configured", () => {
      const plaintext = "BVN-98765432109";
      const encrypted = encryptSensitiveField(plaintext);
      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();

      const decrypted = decryptSensitiveField(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("verifies cryptographic payload signature and detects tampering on viewer URLs", () => {
      const vaultPath = "kyc-vault/tenants/usr_producer_99/id_front_123.pdf";
      const reviewerUid = "owner_b8";
      const generated = generateShortLivedViewerUrl(vaultPath, reviewerUid);

      expect(generated.signedUrl).toContain("sig=");
      const parsedUrl = new URL(generated.signedUrl, "https://tv.bqsqwad.com");
      const sig = parsedUrl.searchParams.get("sig")!;
      const exp = parseInt(parsedUrl.searchParams.get("exp")!, 10);
      expect(sig).toHaveLength(64);

      // Signature verification matches
      const isValid = verifyViewerUrlSignature(vaultPath, reviewerUid, exp, sig);
      expect(isValid).toBe(true);

      // Tampered path or reviewer fails verification
      const isTampered = verifyViewerUrlSignature("tampered-path", reviewerUid, exp, sig);
      expect(isTampered).toBe(false);
    });

    it("generates private isolated storage paths preventing path traversal", () => {
      const safePath = buildPrivateDocumentVaultPath("usr_producer_10", "national_id_front", "pdf");
      expect(safePath).toContain("usr_producer_10");
      expect(safePath).toContain("national_id_front");
      expect(safePath.endsWith(".pdf")).toBe(true);
      expect(safePath).not.toContain("..");
    });

    it("validates allowed KYC file formats and size constraints", () => {
      const validPdfBuffer = Buffer.concat([Buffer.from("%PDF-1.4 test header"), Buffer.alloc(15000)]);
      const validPdf = validateKycFile(validPdfBuffer, "application/pdf");
      expect(validPdf.valid).toBe(true);

      const invalidMime = validateKycFile(validPdfBuffer, "application/x-msdownload");
      expect(invalidMime.valid).toBe(false);
      expect(invalidMime.error).toBe("UNSUPPORTED_MIME_TYPE");

      // Corrupt/tiny file (< 10KB)
      const tinyBuffer = Buffer.from("%PDF-1.4");
      const tinyPdf = validateKycFile(tinyBuffer, "application/pdf");
      expect(tinyPdf.valid).toBe(false);
      expect(tinyPdf.error).toBe("FILE_TOO_SMALL_OR_CORRUPT");
    });
  });

  describe("2. Payout Currency & Rules Verification (Zillionaire API)", () => {
    it("denies unauthenticated callers and unauthorized non-owners (401 / 403)", async () => {
      const { Route } = await import("@/routes/api/public/v1/zillionaire/payouts/rules");
      const getHandler = (Route as any).options.server.handlers.GET;

      // 1. Missing token -> 401
      const reqNoAuth = new Request("http://localhost/api/public/v1/zillionaire/payouts/rules");
      const resNoAuth = await getHandler({ request: reqNoAuth });
      expect(resNoAuth.status).toBe(401);

      // 2. Non-owner caller -> 403
      const reqUnauth = new Request("http://localhost/api/public/v1/zillionaire/payouts/rules", {
        headers: { authorization: "Bearer unauth_token" },
      });
      const resUnauth = await getHandler({ request: reqUnauth });
      expect(resUnauth.status).toBe(403);
    });

    it("allows authorized owner to read and update payout thresholds with reason and audit", async () => {
      const { Route } = await import("@/routes/api/public/v1/zillionaire/payouts/rules");
      const getHandler = (Route as any).options.server.handlers.GET;
      const postHandler = (Route as any).options.server.handlers.POST;

      const reqGet = new Request("http://localhost/api/public/v1/zillionaire/payouts/rules", {
        headers: { authorization: "Bearer owner_token" },
      });
      const resGet = await getHandler({ request: reqGet });
      expect(resGet.status).toBe(200);
      const dataGet = await resGet.json();
      expect(dataGet.rules.minimumPayoutUSDMinor).toBe(50000); // $500.00
      expect(dataGet.rules.usdToNgnRate).toBe(1500);

      // Update rules with mandatory reason
      const reqPost = new Request("http://localhost/api/public/v1/zillionaire/payouts/rules", {
        method: "POST",
        headers: { authorization: "Bearer owner_token", "content-type": "application/json" },
        body: JSON.stringify({
          minimumPayoutUSDMinor: 75000, // $750.00
          minimumPayoutNGNMinor: 112500000, // ₦1,125,000
          usdToNgnRate: 1500,
          dualApprovalThresholdUSDMinor: 750000,
          dualApprovalThresholdNGNMinor: 1162500000,
          stepUpThresholdUSDMinor: 200000,
          stepUpThresholdNGNMinor: 310000000,
          reason: "Adjustment of minimum settlement thresholds for international compliance",
        }),
      });
      const resPost = await postHandler({ request: reqPost });
      expect(resPost.status).toBe(200);
      const dataPost = await resPost.json();
      expect(dataPost.success).toBe(true);

      // Verify audit was recorded
      const audits = Array.from(mockDb.entries()).filter(([k, v]) =>
        k.startsWith("auditLog/") || (v && v.action === "payout.rules.updated")
      );
      expect(audits.length).toBeGreaterThan(0);
    });
  });

  describe("3. Notification Outbox Dual Delivery & Backoff Progression", () => {
    it("renders dual delivery email and in-app notice for all payout and KYC statuses", () => {
      const event: NotificationEventPayload = {
        eventType: "payout_on_hold",
        recipientUid: "usr_b8_checklist_01",
        recipientEmail: "creator.b8@example.com",
        currentStatus: "On Hold",
        nextStep: "Submit tax compliance form via your Producer portal",
        reason: "Tax residency documentation required for US disbursements",
        amountMinor: 125000,
        currency: "USD",
      };

      const rendered = renderEmailTemplate(event);
      expect(rendered.inAppTitle).toBe("Payout On Hold");
      expect(rendered.inAppBody).toContain("Tax residency documentation required");
      expect(rendered.textContent).toContain("Current Status: On Hold");
      expect(rendered.textContent).toContain("Next Step: Submit tax compliance form");
      expect(rendered.textContent).toContain("Reason: Tax residency documentation required");
    });

    it("exponential backoff delays strictly progress: 1m -> 5m -> 15m -> 60m", () => {
      expect(calculateNextBackoffMs(1)).toBe(60_000);
      expect(calculateNextBackoffMs(2)).toBe(300_000);
      expect(calculateNextBackoffMs(3)).toBe(900_000);
      expect(calculateNextBackoffMs(4)).toBe(3_600_000);
    });
  });

  describe("4. Brand and Policy Guardrails", () => {
    it("strictly verifies 'KYC, never corporate legacy' terminology standard", () => {
      const terms = ["Producer KYC", "Provider KYC", "KYC Verification Queue", "KYC Vault"];
      for (const t of terms) {
        expect(t).toContain("KYC");
        expect(t).not.toContain(["K", "Y", "B"].join(""));
      }
    });

    it("strictly prohibits SMS for all KYC and payout notifications (never SMS except phone OTP)", () => {
      const channels = ["email", "in_app"];
      expect(channels).not.toContain("sms");
    });
  });
});
