import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/api/public/v1/zillionaire/access/mfa";
import { generateTotpSecret, encryptTotpSecret, totpAt } from "@/lib/server/zillionaire-totp";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  writeAuditLog: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  transact: vi.fn(),
}));
vi.mock("@/lib/server/access", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/server/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));

const handler = (
  Route.options.server as unknown as {
    handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
  }
).handlers.POST;
const owner = { uid: "owner-1", email: "owner@bqsqwad.com", emailVerified: true };
const access = { isZillionaireOwner: true };

function request(body: unknown) {
  return new Request("https://local/api/public/v1/zillionaire/access/mfa", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("V5-03 owner MFA route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["ZILLIONAIRE_ACCESS_PASSWORD"] = "test-owner-password";
    process.env["ZILLIONAIRE_MFA_ENCRYPTION_KEY"] =
      "test-encryption-key-with-32-characters-minimum";
    const fs = {
      getDoc: mocks.getDoc,
      setDoc: mocks.setDoc,
      deleteDoc: mocks.deleteDoc,
      transact: mocks.transact,
      docName: (p: string) => `documents/${p}`,
    };
    mocks.requireViewer.mockResolvedValue({ user: owner, fs, access });
    mocks.getDoc.mockResolvedValue(null);
    mocks.setDoc.mockResolvedValue(undefined);
    mocks.deleteDoc.mockResolvedValue(undefined);
    mocks.transact.mockResolvedValue(true);
    mocks.writeAuditLog.mockResolvedValue("audit-1");
  });

  it("requires verified owner access and never enrolls another role", async () => {
    mocks.requireViewer.mockResolvedValueOnce({
      user: owner,
      fs: {},
      access: { isZillionaireOwner: false },
    });
    const response = await handler({
      request: request({
        action: "ENROLL",
        password: "test-owner-password",
        reason: "Enable owner MFA",
      }),
    });
    expect(response.status).toBe(403);
  });

  it("stores only an encrypted pending secret and returns an authenticator provisioning URI", async () => {
    const response = await handler({
      request: request({
        action: "ENROLL",
        password: "test-owner-password",
        reason: "Enable owner MFA",
      }),
    });
    const body = (await response.json()) as { secret: string; otpauthUrl: string };
    expect(response.status).toBe(200);
    expect(body.otpauthUrl).toContain("otpauth://totp/");
    expect(body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(mocks.setDoc).toHaveBeenCalledWith(
      "zillionaireMfaPending/owner-1",
      expect.objectContaining({ secret: expect.not.stringContaining(body.secret) }),
    );
  });

  it("issues recovery codes only after confirmation and enables MFA atomically", async () => {
    const secret = generateTotpSecret();
    mocks.getDoc
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ secret: encryptTotpSecret(secret), expiresAt: Date.now() + 60_000 });
    const response = await handler({
      request: request({ action: "CONFIRM", code: totpAt(secret), reason: "Enable owner MFA" }),
    });
    const body = (await response.json()) as { enabled: boolean; recoveryCodes: string[] };
    expect(response.status).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.recoveryCodes).toHaveLength(10);
    expect(mocks.transact).toHaveBeenCalledOnce();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "owner.mfa_enabled" }),
    );
  });

  it("fails closed when the encryption key is absent", async () => {
    delete process.env["ZILLIONAIRE_MFA_ENCRYPTION_KEY"];
    const response = await handler({
      request: request({
        action: "ENROLL",
        password: "test-owner-password",
        reason: "Enable owner MFA",
      }),
    });
    expect(response.status).toBe(503);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});
