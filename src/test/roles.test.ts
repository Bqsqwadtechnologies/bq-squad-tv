import { describe, expect, it, vi } from "vitest";
import { resolvePlatformAccess, isProtectedSuperAdmin } from "@/lib/server/roles";
import type { Firestore } from "@/lib/server/firebase-admin";

function fakeFirestore(user: Record<string, unknown> | null, producer: Record<string, unknown> | null) {
  return {
    getDoc: vi.fn(async (path: string) => path.startsWith("users/") ? user : producer),
  } as unknown as Firestore;
}

describe("platform role resolution", () => {
  it("always grants the viewer baseline but does not activate unpaid producers", async () => {
    const fs = fakeFirestore({ roleTags: ["producer"] }, { planStatus: "PENDING" });
    const access = await resolvePlatformAccess(fs, "u1", "viewer@example.com");
    expect(access.roles).toEqual(["viewer"]);
    expect(access.producerPlanActive).toBe(false);
  });

  it("requires an active producer plan even when a signed custom claim exists", async () => {
    const fs = fakeFirestore({ roleTags: [] }, { planStatus: "ACTIVE" });
    const access = await resolvePlatformAccess(fs, "u1", "p@example.com", { producer: true });
    expect(access.roles).toContain("producer");
  });

  it("recognizes the exact configured super-admin email case-insensitively", async () => {
    vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
    const fs = fakeFirestore(null, null);
    const access = await resolvePlatformAccess(fs, "u1", "OWNER@example.com");
    expect(access.isSuperAdmin).toBe(true);
    expect(access.adminModules).toContain("pricing");
    expect(isProtectedSuperAdmin("Owner@Example.com")).toBe(true);
    vi.unstubAllEnvs();
  });

  it("does not grant super-admin status to aliases or partial email matches", async () => {
    vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
    const fs = fakeFirestore(null, null);
    const access = await resolvePlatformAccess(fs, "u1", "owner+alias@example.com");
    expect(access.isSuperAdmin).toBe(false);
    expect(isProtectedSuperAdmin("other@example.com")).toBe(false);
    vi.unstubAllEnvs();
  });
});
