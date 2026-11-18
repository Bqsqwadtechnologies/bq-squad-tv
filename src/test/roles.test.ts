import { describe, expect, it, vi } from "vitest";
import {
  requireAdminModule,
  resolvePlatformAccess,
  isProtectedZillionaire,
} from "@/lib/server/roles";
import type { Firestore } from "@/lib/server/firebase-admin";

function fakeFirestore(user: Record<string, unknown> | null, producer: Record<string, unknown> | null) {
  return {
    getDoc: vi.fn(async (path: string) => path.startsWith("users/") ? user : producer),
  } as unknown as Firestore;
}

describe("Zillionaire identity and delegated module permissions", () => {
  it("always grants the viewer baseline but does not activate unpaid producers", async () => {
    const fs = fakeFirestore({ roleTags: ["producer"] }, { planStatus: "PENDING" });
    const access = await resolvePlatformAccess(fs, "u1", "viewer@example.com");
    expect(access.roles).toEqual(["viewer"]);
    expect(access.producerPlanActive).toBe(false);
  });

  it("requires an active producer plan even when a signed custom claim exists", async () => {
    const fs = fakeFirestore({ roleTags: [] }, { planStatus: "ACTIVE", verificationStatus: "APPROVED" });
    const access = await resolvePlatformAccess(fs, "u1", "p@example.com", { producer: true });
    expect(access.roles).toContain("producer");
  });

  it("does not activate producer permissions until identity and legal verification is approved", async () => {
    const fs = fakeFirestore(
      { roleTags: ["producer"] },
      { planStatus: "ACTIVE", verificationStatus: "PENDING" },
    );
    const access = await resolvePlatformAccess(fs, "u1", "producer@example.com");
    expect(access.producerPlanActive).toBe(true);
    expect(access.roles).toEqual(["viewer"]);
  });

  it("recognizes only the verified exact configured Zillionaire owner email", async () => {
    vi.stubEnv("ZILLIONAIRE_EMAIL", "owner@example.com");
    const fs = fakeFirestore(null, null);
    const access = await resolvePlatformAccess(fs, "u1", "OWNER@example.com", {}, true);
    expect(access.isZillionaireOwner).toBe(true);
    expect(access.adminModules).toContain("pricing");
    expect(isProtectedZillionaire("Owner@Example.com")).toBe(true);
    vi.unstubAllEnvs();
  });

  it("does not grant Zillionaire control access until the configured email is verified", async () => {
    vi.stubEnv("ZILLIONAIRE_EMAIL", "owner@example.com");
    const fs = fakeFirestore(null, null);
    await expect(requireAdminModule(fs, {
      uid: "owner-1", email: "owner@example.com", emailVerified: false,
    }, "content")).rejects.toMatchObject({ status: 403 });
    vi.unstubAllEnvs();
  });

  it("accepts the server-recorded six-digit OTP proof when it matches the current email", async () => {
    vi.stubEnv("ZILLIONAIRE_EMAIL", "owner@example.com");
    const fs = fakeFirestore({ email: "OWNER@example.com", appEmailVerified: true }, null);
    const access = await requireAdminModule(fs, {
      uid: "owner-1", email: "owner@example.com", emailVerified: false,
    }, "content");
    expect(access.isZillionaireOwner).toBe(true);
    expect(access.emailVerified).toBe(true);
    vi.unstubAllEnvs();
  });

  it("does not accept OTP verification after the account email changes", async () => {
    vi.stubEnv("ZILLIONAIRE_EMAIL", "owner@example.com");
    const fs = fakeFirestore({ email: "old@example.com", appEmailVerified: true }, null);
    await expect(requireAdminModule(fs, {
      uid: "owner-1", email: "owner@example.com", emailVerified: false,
    }, "content")).rejects.toMatchObject({ status: 403 });
    vi.unstubAllEnvs();
  });

  it("grants only explicitly delegated modules and ignores role tags or custom claims", async () => {
    const fs = fakeFirestore({ roleTags: ["legacy-control"], adminModules: ["pricing"] }, null);
    await expect(requireAdminModule(fs, {
      uid: "delegated-1", email: "delegated@example.com", emailVerified: true,
      customClaims: { legacyControl: true, adminModules: ["security", "payments"] },
    }, "pricing")).resolves.toBeTruthy();
    await expect(requireAdminModule(fs, {
      uid: "delegated-1", email: "delegated@example.com", emailVerified: true,
      customClaims: { legacyControl: true, adminModules: ["security", "payments"] },
    }, "security")).rejects.toMatchObject({ status: 403 });
    const access = await resolvePlatformAccess(fs, "delegated-1", "delegated@example.com", {
      legacyControl: true, adminModules: ["security"],
    }, true);
    expect(access.roles).toEqual(["viewer"]);
    expect(access.adminModules).toEqual(["pricing"]);
  });

  it("never allows a producer account to approve content without a delegated content permission", async () => {
    const fs = fakeFirestore(
      { roleTags: ["producer"], adminModules: [] },
      { planStatus: "ACTIVE", verificationStatus: "APPROVED" },
    );
    await expect(requireAdminModule(fs, {
      uid: "producer-1", email: "producer@example.com", emailVerified: true,
    }, "content")).rejects.toMatchObject({ status: 403 });
  });

  it("does not grant any control section from an legacy role metadata", async () => {
    const fs = fakeFirestore({ roleTags: ["legacy-control"] }, null);
    await expect(requireAdminModule(fs, {
      uid: "old-role", email: "old@example.com", emailVerified: true,
      customClaims: { legacyControl: true },
    }, "overview")).rejects.toMatchObject({ status: 403 });
  });

  it("does not protect aliases or partial email matches as the Zillionaire owner", async () => {
    vi.stubEnv("ZILLIONAIRE_EMAIL", "owner@example.com");
    const fs = fakeFirestore(null, null);
    const access = await resolvePlatformAccess(fs, "u1", "owner+alias@example.com", {}, true);
    expect(access.isZillionaireOwner).toBe(false);
    expect(isProtectedZillionaire("other@example.com")).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("Provider role and isolation", () => {
  it("recognizes provider role with valid providerUser record", async () => {
    const fs = {
      getDoc: vi.fn(async (path: string) => {
        if (path.startsWith("providerUsers/")) {
          return { status: "ACTIVE", providerId: "prov-123" };
        }
        return null;
      }),
    } as unknown as Firestore;
    const access = await resolvePlatformAccess(fs, "u-prov", "rep@provider.com", {}, true);
    expect(access.roles).toContain("provider");
    expect(access.providerId).toBe("prov-123");
  });

  it("enforces provider isolation between different provider organisations", async () => {
    const { requireProviderAccess } = await import("@/lib/server/roles");
    const fs = {
      getDoc: vi.fn(async (path: string) => {
        if (path.startsWith("providerUsers/")) {
          return { status: "ACTIVE", providerId: "prov-alpha" };
        }
        return null;
      }),
    } as unknown as Firestore;
    // Own provider access succeeds
    await expect(requireProviderAccess(fs, { uid: "u1", email: "a@p.com", emailVerified: true }, "prov-alpha"))
      .resolves.toMatchObject({ providerId: "prov-alpha" });

    // Other provider access fails
    await expect(requireProviderAccess(fs, { uid: "u1", email: "a@p.com", emailVerified: true }, "prov-beta"))
      .rejects.toMatchObject({ status: 403 });
  });
});
