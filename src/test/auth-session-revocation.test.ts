import { describe, expect, it } from "vitest";
import { assertAuthenticationSessionActive } from "@/lib/server/auth-session-revocation";

describe("global authentication session revocation", () => {
  it("allows sessions when no revocation timestamp exists", () => {
    expect(() => assertAuthenticationSessionActive(null, 100)).not.toThrow();
    expect(() => assertAuthenticationSessionActive({}, 100)).not.toThrow();
  });

  it("allows sessions authenticated after the revocation time", () => {
    expect(() =>
      assertAuthenticationSessionActive({ sessionsRevokedAfter: 100 }, 101),
    ).not.toThrow();
  });

  it("rejects sessions authenticated at or before the revocation time", () => {
    expect(() => assertAuthenticationSessionActive({ sessionsRevokedAfter: 100 }, 100)).toThrow(
      expect.objectContaining({ status: 401, code: "AUTH_SESSION_REVOKED" }),
    );
    expect(() => assertAuthenticationSessionActive({ sessionsRevokedAfter: 100 }, 99)).toThrow(
      expect.objectContaining({ status: 401, code: "AUTH_SESSION_REVOKED" }),
    );
  });
});
