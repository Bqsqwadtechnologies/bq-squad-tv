import { afterEach, describe, expect, it } from "vitest";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpAt,
  verifyTotp,
} from "@/lib/server/zillionaire-totp";

describe("owner authenticator primitives", () => {
  const old = process.env["ZILLIONAIRE_MFA_ENCRYPTION_KEY"];
  afterEach(() => {
    if (old === undefined) delete process.env["ZILLIONAIRE_MFA_ENCRYPTION_KEY"];
    else process.env["ZILLIONAIRE_MFA_ENCRYPTION_KEY"] = old;
  });
  it("matches RFC 6238 SHA1 vector at 59 seconds", () => {
    expect(totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
  });
  it("validates a short clock-drift window and rejects malformed codes", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, totpAt(secret))).toBe(true);
    expect(verifyTotp(secret, "12345")).toBe(false);
  });
  it("encrypts secrets at rest and only stores recovery-code hashes", () => {
    process.env["ZILLIONAIRE_MFA_ENCRYPTION_KEY"] = "test-only-key-with-enough-entropy-123456";
    const secret = generateTotpSecret();
    const sealed = encryptTotpSecret(secret);
    expect(sealed).not.toContain(secret);
    expect(decryptTotpSecret(sealed)).toBe(secret);
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(hashRecoveryCode(codes[0]!)).not.toBe(codes[0]);
  });
});
