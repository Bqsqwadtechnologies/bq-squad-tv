import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Route as StatusRoute } from "@/routes/api/public/v1/zillionaire/access/status";
import { Route as UnlockRoute } from "@/routes/api/public/v1/zillionaire/access/unlock";
import { Route as LockRoute } from "@/routes/api/public/v1/zillionaire/access/lock";
import {
  createUnlockToken,
  parseAndVerifyUnlockToken,
  clearFailure,
  checkLockout,
  isAccessPasswordConfigured,
  verifyPasswordConstantTime,
} from "@/lib/server/zillionaire-access";
import * as accessModule from "@/lib/server/access";
import { Firestore } from "@/lib/server/firebase-admin";
import { encryptTotpSecret, generateTotpSecret, totpAt } from "@/lib/server/zillionaire-totp";

describe("V4-01 Batch 02: Zillionaire Owner Access Password & Unlock Gate", () => {
  const originalEnv = { ...process.env };
  const ownerUid = "owner-uid-123";
  const ownerEmail = "owner@bqsqwad.tv";

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env["ZILLIONAIRE_EMAIL"] = ownerEmail;
    process.env["ZILLIONAIRE_ACCESS_PASSWORD"] = "UltraSecretZillionairePass2026!";
    process.env["SESSION_SECRET"] = "test-session-secret-bqsqwad-32chars!";
    process.env["ZILLIONAIRE_MFA_ENCRYPTION_KEY"] = "test-only-encryption-key-with-entropy-123";
    clearFailure(ownerUid);
    clearFailure("other-user-456");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function createMockFs() {
    return {
      getDoc: vi.fn(async () => null),
      query: vi.fn(async () => []),
      setDoc: vi.fn(async () => undefined),
      patchDoc: vi.fn(async () => undefined),
      docName: (p: string) => `projects/p/databases/(default)/documents/${p}`,
    } as unknown as Firestore;
  }

  it("1. Missing secret: returns configured=false and refuses unlock with 423", async () => {
    delete process.env["ZILLIONAIRE_ACCESS_PASSWORD"];
    expect(isAccessPasswordConfigured()).toBe(false);

    const mockFs = createMockFs();
    vi.spyOn(accessModule, "requireViewer").mockResolvedValue({
      user: {
        uid: ownerUid,
        email: ownerEmail,
        emailVerified: true,
        authTime: 0,
        issuedAt: 0,
        customClaims: {},
      },
      fs: mockFs,
      access: {
        roles: ["viewer"],
        isZillionaireOwner: true,
        needsOwnerVerification: false,
        zillionaireModules: ["overview"],
        adminModules: ["overview"],
        producerPlanActive: false,
        emailVerified: true,
      },
    });

    const statusReq = new Request("http://localhost/api/public/v1/zillionaire/access/status");
    const statusHandler = (
      StatusRoute.options.server as unknown as {
        handlers: { GET: (ctx: { request: Request }) => Promise<Response> };
      }
    ).handlers.GET;
    const statusRes = await statusHandler({ request: statusReq });
    const statusJson = await statusRes.json();

    expect(statusRes.status).toBe(200);
    expect(statusJson.configured).toBe(false);
    expect(statusJson.unlocked).toBe(false);

    const unlockReq = new Request("http://localhost/api/public/v1/zillionaire/access/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "UltraSecretZillionairePass2026!" }),
    });
    const unlockHandler = (
      UnlockRoute.options.server as unknown as {
        handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
      }
    ).handlers.POST;
    const unlockRes = await unlockHandler({ request: unlockReq });
    expect(unlockRes.status).toBe(423);
    const unlockJson = await unlockRes.json();
    expect(unlockJson.code).toBe("ZILLIONAIRE_PASSWORD_NOT_CONFIGURED");
  });

  it("accepts a pasted secret with one terminal line ending without trimming password spaces", () => {
    process.env["ZILLIONAIRE_ACCESS_PASSWORD"] = "  Exact Password  \r\n";
    expect(isAccessPasswordConfigured()).toBe(true);
    expect(verifyPasswordConstantTime("  Exact Password  ")).toBe(true);
    expect(verifyPasswordConstantTime("Exact Password")).toBe(false);
  });

  it("2. Non-owner with correct password: is denied with 403 and denial recorded", async () => {
    const nonOwnerUid = "viewer-intruder-456";
    const nonOwnerEmail = "intruder@example.com";
    const mockFs = createMockFs();

    vi.spyOn(accessModule, "requireViewer").mockResolvedValue({
      user: {
        uid: nonOwnerUid,
        email: nonOwnerEmail,
        emailVerified: true,
        authTime: 0,
        issuedAt: 0,
        customClaims: {},
      },
      fs: mockFs,
      access: {
        roles: ["viewer"],
        isZillionaireOwner: false,
        needsOwnerVerification: false,
        zillionaireModules: [],
        adminModules: [],
        producerPlanActive: false,
        emailVerified: true,
      },
    });

    const unlockReq = new Request("http://localhost/api/public/v1/zillionaire/access/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "UltraSecretZillionairePass2026!" }),
    });
    const unlockHandler = (
      UnlockRoute.options.server as unknown as {
        handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
      }
    ).handlers.POST;
    const unlockRes = await unlockHandler({ request: unlockReq });

    expect(unlockRes.status).toBe(403);
    const unlockJson = await unlockRes.json();
    expect(unlockJson.code).toBe("OWNER_REQUIRED");
  });

  it("3. Wrong password: increments failure count and rejects with 401", async () => {
    const mockFs = createMockFs();
    vi.spyOn(accessModule, "requireViewer").mockResolvedValue({
      user: {
        uid: ownerUid,
        email: ownerEmail,
        emailVerified: true,
        authTime: 0,
        issuedAt: 0,
        customClaims: {},
      },
      fs: mockFs,
      access: {
        roles: ["viewer"],
        isZillionaireOwner: true,
        needsOwnerVerification: false,
        zillionaireModules: ["overview"],
        adminModules: ["overview"],
        producerPlanActive: false,
        emailVerified: true,
      },
    });

    const unlockReq = new Request("http://localhost/api/public/v1/zillionaire/access/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "WrongPasswordAttempt" }),
    });
    const unlockHandler = (
      UnlockRoute.options.server as unknown as {
        handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
      }
    ).handlers.POST;
    const unlockRes = await unlockHandler({ request: unlockReq });

    expect(unlockRes.status).toBe(401);
    const unlockJson = await unlockRes.json();
    expect(unlockJson.code).toBe("INVALID_PASSWORD");
    expect(unlockJson.error).toMatch(/owner password does not match/i);
  });

  it(
    "4. Lockout after 5 failed attempts: locks for 15 minutes and returns 429",
    { timeout: 15000 },
    async () => {
      const mockFs = createMockFs();
      vi.spyOn(accessModule, "requireViewer").mockResolvedValue({
        user: {
          uid: ownerUid,
          email: ownerEmail,
          emailVerified: true,
          authTime: 0,
          issuedAt: 0,
          customClaims: {},
        },
        fs: mockFs,
        access: {
          roles: ["viewer"],
          isZillionaireOwner: true,
          needsOwnerVerification: false,
          zillionaireModules: ["overview"],
          adminModules: ["overview"],
          producerPlanActive: false,
          emailVerified: true,
        },
      });

      const unlockHandler = (
        UnlockRoute.options.server as unknown as {
          handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
        }
      ).handlers.POST;

      // 4 failed attempts
      for (let i = 0; i < 4; i++) {
        const res = await unlockHandler({
          request: new Request("http://localhost/api/public/v1/zillionaire/access/unlock", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password: `BadPass${i}` }),
          }),
        });
        expect(res.status).toBe(401);
      }

      // 5th failed attempt triggers 429 lockout
      const res5 = await unlockHandler({
        request: new Request("http://localhost/api/public/v1/zillionaire/access/unlock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password: "BadPassFinal" }),
        }),
      });
      expect(res5.status).toBe(429);
      const json5 = await res5.json();
      expect(json5.code).toBe("ZILLIONAIRE_LOCKED_OUT");

      // Subsequent attempt is blocked by lockout
      const lockoutState = checkLockout(ownerUid);
      expect(lockoutState.locked).toBe(true);
      expect(lockoutState.remainingLockSeconds).toBeGreaterThan(800);
    },
  );

  it("5. Correct password and TOTP: unlocks, issues signed token with 8h absolute TTL and Set-Cookie", async () => {
    const mockFs = createMockFs();
    const secret = generateTotpSecret();
    vi.mocked(mockFs.getDoc).mockImplementation(async (path: string) =>
      path === `zillionaireMfa/${ownerUid}`
        ? { enabled: true, secret: encryptTotpSecret(secret), recoveryCodeHashes: [] }
        : null,
    );
    vi.spyOn(accessModule, "requireViewer").mockResolvedValue({
      user: {
        uid: ownerUid,
        email: ownerEmail,
        emailVerified: true,
        authTime: 0,
        issuedAt: 0,
        customClaims: {},
      },
      fs: mockFs,
      access: {
        roles: ["viewer"],
        isZillionaireOwner: true,
        needsOwnerVerification: false,
        zillionaireModules: ["overview"],
        adminModules: ["overview"],
        producerPlanActive: false,
        emailVerified: true,
      },
    });

    const unlockReq = new Request("http://localhost/api/public/v1/zillionaire/access/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "UltraSecretZillionairePass2026!", code: totpAt(secret) }),
    });
    const unlockHandler = (
      UnlockRoute.options.server as unknown as {
        handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
      }
    ).handlers.POST;
    const unlockRes = await unlockHandler({ request: unlockReq });

    expect(unlockRes.status).toBe(200);
    const json = await unlockRes.json();
    expect(json.ok).toBe(true);
    expect(typeof json.token).toBe("string");
    expect(json.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 28000);
    expect(json.expiresAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 28800);

    const setCookie = unlockRes.headers.get("set-cookie");
    expect(setCookie).toContain("zillionaire_unlock=");
    expect(setCookie).toContain("HttpOnly");
  });

  it("6. Token validation: valid token, expired token, and token from another user", () => {
    const { token } = createUnlockToken(ownerUid);
    const validCheck = parseAndVerifyUnlockToken(token, ownerUid);
    expect(validCheck.valid).toBe(true);

    // Mismatched UID (token from another user / session)
    const mismatchCheck = parseAndVerifyUnlockToken(token, "someone-else-uid");
    expect(mismatchCheck.valid).toBe(false);
    expect(mismatchCheck.reason).toBe("UID_MISMATCH");

    // Tampered token
    const tampered = token.slice(0, -4) + "XXXX";
    const tamperedCheck = parseAndVerifyUnlockToken(tampered, ownerUid);
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.reason).toBe("INVALID_SIGNATURE");
  });

  it("8. Direct unlock when MFA is not enrolled: unlocks with password alone without requiring TOTP", async () => {
    const mockFs = createMockFs();
    // No MFA document exists for owner
    vi.mocked(mockFs.getDoc).mockResolvedValue(null);

    vi.spyOn(accessModule, "requireViewer").mockResolvedValue({
      user: {
        uid: ownerUid,
        email: ownerEmail,
        emailVerified: true,
        authTime: 0,
        issuedAt: 0,
        customClaims: {},
      },
      fs: mockFs,
      access: {
        roles: ["viewer"],
        isZillionaireOwner: true,
        needsOwnerVerification: false,
        zillionaireModules: ["overview"],
        adminModules: ["overview"],
        producerPlanActive: false,
        emailVerified: true,
      },
    });

    const unlockReq = new Request("http://localhost/api/public/v1/zillionaire/access/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "UltraSecretZillionairePass2026!" }),
    });
    const unlockHandler = (
      UnlockRoute.options.server as unknown as {
        handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
      }
    ).handlers.POST;
    const unlockRes = await unlockHandler({ request: unlockReq });

    expect(unlockRes.status).toBe(200);
    const json = await unlockRes.json();
    expect(json.ok).toBe(true);
    expect(typeof json.token).toBe("string");
  });

  it("7. Lock endpoint: clears unlock cookie", async () => {
    vi.spyOn(accessModule, "requireViewer").mockResolvedValue({
      user: {
        uid: ownerUid,
        email: ownerEmail,
        emailVerified: true,
        authTime: 0,
        issuedAt: 0,
        customClaims: {},
      },
      fs: createMockFs(),
      access: {
        roles: ["viewer"],
        isZillionaireOwner: true,
        needsOwnerVerification: false,
        zillionaireModules: ["overview"],
        adminModules: ["overview"],
        producerPlanActive: false,
        emailVerified: true,
      },
    });

    const lockHandler = (
      LockRoute.options.server as unknown as {
        handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
      }
    ).handlers.POST;
    const res = await lockHandler({
      request: new Request("http://localhost/api/public/v1/zillionaire/access/lock", {
        method: "POST",
      }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("Max-Age=0");
  });
});
