import { describe, expect, it, vi } from "vitest";
import { resolvePlatformAccess } from "@/lib/server/roles";

function mockFirestore(user: Record<string, unknown> | null = null) {
  return { getDoc: async (path: string) => path.startsWith("users/") ? user : null } as never;
}

describe("protected owner role resolution", () => {
  it("prefers the current owner email and requires verified email", async () => {
    vi.stubEnv("ZILLIONAIRE_EMAIL", "owner@bqsqwad.com");
    vi.stubEnv("ADMIN_EMAIL", "legacy@bqsqwad.com");
    const verified = await resolvePlatformAccess(mockFirestore(), "u1", "OWNER@bqsqwad.com", {}, true);
    expect(verified.isSuperAdmin).toBe(true);
    expect(verified.roles).toContain("admin");
    const unverified = await resolvePlatformAccess(mockFirestore(), "u2", "owner@bqsqwad.com", {}, false);
    expect(unverified.isSuperAdmin).toBe(false);
    vi.unstubAllEnvs();
  });

  it("supports the legacy email only when the current secret is absent", async () => {
    vi.stubEnv("ZILLIONAIRE_EMAIL", "");
    vi.stubEnv("ADMIN_EMAIL", "legacy@bqsqwad.com");
    const access = await resolvePlatformAccess(mockFirestore(), "u3", "LEGACY@bqsqwad.com", {}, true);
    expect(access.isSuperAdmin).toBe(true);
    vi.unstubAllEnvs();
  });
});
