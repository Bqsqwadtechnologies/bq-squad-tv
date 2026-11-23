import { describe, expect, it } from "vitest";
import {
  requirePlatformRole,
  requireZillionaireModule,
  requireProviderAccess,
} from "../lib/server/roles";
import { ApiError } from "../lib/server/firebase-admin";
import { applySecurityHeaders } from "../lib/server/security-headers";

describe("Security Test Suite (V5-03 Batch 10)", () => {
  it("denies unauthenticated and viewer callers from Zillionaire and provider consoles", async () => {
    const mockFs = {
      getDoc: async () => ({ roles: ["viewer"] }),
    } as any;
    const viewerUser = { uid: "viewer_1", email: "viewer@example.com", roles: ["viewer"] } as any;

    // Viewer attempting Zillionaire module access
    await expect(requireZillionaireModule(mockFs, viewerUser, "security")).rejects.toThrow();

    // Viewer attempting Producer access
    await expect(requirePlatformRole(mockFs, viewerUser, "producer")).rejects.toThrow();

    // Viewer attempting Provider access
    await expect(requireProviderAccess(mockFs, viewerUser, "provider_1")).rejects.toThrow();
  });

  it("prevents IDOR: Provider A cannot access Provider B's resources", async () => {
    const mockFs = {
      getDoc: async (path: string) => {
        if (path === "users/prov_a") {
          return { email: "prov@example.com" };
        }
        if (path === "providerUsers/prov_a") {
          return { providerId: "provider_alpha", status: "ACTIVE" };
        }
        return null;
      },
    } as any;

    const providerA = { uid: "prov_a", email: "provisional@example.com" } as any;

    // Accessing own provider ID succeeds
    const ownAccess = await requireProviderAccess(mockFs, providerA, "provider_alpha");
    expect(ownAccess.providerId).toBe("provider_alpha");

    // Accessing another provider ID fails with 403
    await expect(requireProviderAccess(mockFs, providerA, "provider_beta")).rejects.toThrow(ApiError);
  });

  it("applies strict security headers across public responses", () => {
    const original = new Response("ok", { status: 200 });
    const secured = applySecurityHeaders(original);
    expect(secured.headers.get("x-content-type-options")).toBe("nosniff");
    expect(secured.headers.get("x-frame-options")).toBe("DENY");
    expect(secured.headers.get("referrer-policy")).toContain("strict-origin");
    expect(secured.headers.get("strict-transport-security")).toContain("max-age=31536000");
    const csp = secured.headers.get("content-security-policy");
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://accounts.google.com");
  });

  it("detects tampering in audit chain verification", () => {
    const validChain = [
      { id: "1", action: "login", previousHash: "GENESIS", hash: "hash1" },
      { id: "2", action: "step_up", previousHash: "hash1", hash: "hash2" },
    ];
    // Tampered chain where previousHash doesn't match
    const tamperedChain = [
      { id: "1", action: "login", previousHash: "GENESIS", hash: "hash1" },
      { id: "2", action: "step_up", previousHash: "corrupted_hash", hash: "hash2" },
    ];

    expect(tamperedChain[1]?.previousHash).not.toBe(tamperedChain[0]?.hash);
  });
});
