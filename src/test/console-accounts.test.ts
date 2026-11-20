import { describe, expect, it } from "vitest";
import { requireProviderAccess, requirePlatformRole } from "../lib/server/roles";
import { ApiError } from "../lib/server/firebase-admin";

describe("Console Account Isolation (V5-04 Batch 1)", () => {
  it("prevents viewer account from accessing producer console", async () => {
    const mockFs = {
      getDoc: async () => ({ roles: ["viewer"] }),
    } as any;
    const viewer = { uid: "viewer_usr", email: "viewer@example.com" };

    await expect(requirePlatformRole(mockFs, viewer, "producer")).rejects.toThrow();
  });

  it("prevents viewer account from accessing provider console", async () => {
    const mockFs = {
      getDoc: async () => ({ roles: ["viewer"] }),
    } as any;
    const viewer = { uid: "viewer_usr", email: "viewer@example.com" };

    await expect(requireProviderAccess(mockFs, viewer)).rejects.toThrow();
  });

  it("allows verified producer to access producer console", async () => {
    const mockFs = {
      getDoc: async (path: string) => {
        if (path === "users/producer_usr") {
          return { roleTags: ["producer"] };
        }
        if (path === "producers/producer_usr") {
          return { planStatus: "ACTIVE", verificationStatus: "APPROVED" };
        }
        return null;
      },
    } as any;

    const producerUser = { uid: "producer_usr", email: "producer@example.com" };
    const access = await requirePlatformRole(mockFs, producerUser, "producer");
    expect(access.roles).toContain("producer");
  });

  it("allows active provider to access provider console", async () => {
    const mockFs = {
      getDoc: async (path: string) => {
        if (path === "users/provider_usr") {
          return { email: "provider@example.com" };
        }
        if (path === "providerUsers/provider_usr") {
          return { providerId: "prov_acme", status: "ACTIVE" };
        }
        return null;
      },
    } as any;

    const providerUser = { uid: "provider_usr", email: "provider@example.com" };
    const access = await requireProviderAccess(mockFs, providerUser, "prov_acme");
    expect(access.providerId).toBe("prov_acme");
  });
});
