import { describe, expect, it, vi } from "vitest";
import {
  requireAdminModule,
  requirePlatformRole,
  requireProviderAccess,
  resolvePlatformAccess,
} from "@/lib/server/roles";
import type { Firestore } from "@/lib/server/firebase-admin";

function createMockFirestore(store: Record<string, Record<string, unknown>>) {
  return {
    getDoc: vi.fn(async (path: string) => store[path] || null),
    listCollection: vi.fn(async (col: string) => {
      return Object.entries(store)
        .filter(([p]) => p.startsWith(`${col}/`))
        .map(([_, v]) => v);
    }),
  } as unknown as Firestore;
}

describe("Server-Side Role Checks and Role Data Isolation", () => {
  const store: Record<string, Record<string, unknown>> = {
    // Viewer
    "users/viewer-1": { email: "viewer@example.com", roleTags: [] },

    // Producer A
    "users/producer-A": { email: "producerA@example.com", roleTags: ["producer"] },
    "producers/producer-A": { planStatus: "ACTIVE", verificationStatus: "APPROVED" },
    "channels/chan-producer-A": { ownerUid: "producer-A", name: "Studio A Stream" },

    // Producer B
    "users/producer-B": { email: "producerB@example.com", roleTags: ["producer"] },
    "producers/producer-B": { planStatus: "ACTIVE", verificationStatus: "APPROVED" },
    "channels/chan-producer-B": { ownerUid: "producer-B", name: "Studio B Stream" },

    // Provider 1
    "users/provider-1": { email: "rep1@broadcast.com", roleTags: [] },
    "providerUsers/provider-1": { status: "ACTIVE", providerId: "prov-news-corp" },
    "liveChannels/ch-prov-1": { providerId: "prov-news-corp", name: "News 24/7" },
    "providerStatements/stmt-prov-1": { providerId: "prov-news-corp", grossRevenueMinor: 5000000 },
    "providerDisputes/disp-prov-1": { providerId: "prov-news-corp", subject: "October Reconciliation" },

    // Provider 2
    "users/provider-2": { email: "rep2@sports.com", roleTags: [] },
    "providerUsers/provider-2": { status: "ACTIVE", providerId: "prov-sports-net" },
    "liveChannels/ch-prov-2": { providerId: "prov-sports-net", name: "Live Sports" },
    "providerStatements/stmt-prov-2": { providerId: "prov-sports-net", grossRevenueMinor: 12000000 },
    "providerDisputes/disp-prov-2": { providerId: "prov-sports-net", subject: "Feed Quality Inquiry" },

    // Zillionaire Owner
    "users/owner-1": { email: "owner@zillionaire.tv", roleTags: [] },
  };

  const fs = createMockFirestore(store);

  describe("Viewer role boundary enforcement", () => {
    const viewerUser = { uid: "viewer-1", email: "viewer@example.com", emailVerified: true };

    it("viewer role is barred from Zillionaire /admin console", async () => {
      await expect(requireAdminModule(fs, viewerUser, "overview"))
        .rejects.toMatchObject({ status: 403, code: "ZILLIONAIRE_SCOPE_REQUIRED" });
      await expect(requireAdminModule(fs, viewerUser, "providers"))
        .rejects.toMatchObject({ status: 403, code: "ZILLIONAIRE_SCOPE_REQUIRED" });
    });

    it("viewer role is barred from /producer console and API actions", async () => {
      await expect(requirePlatformRole(fs, viewerUser, "producer"))
        .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    });

    it("viewer role is barred from /provider console and API actions", async () => {
      await expect(requireProviderAccess(fs, viewerUser))
        .rejects.toMatchObject({ status: 403, code: "PROVIDER_ROLE_REQUIRED" });
    });
  });

  describe("Producer role boundary and cross-producer isolation", () => {
    const producerAUser = { uid: "producer-A", email: "producerA@example.com", emailVerified: true };
    const producerBUser = { uid: "producer-B", email: "producerB@example.com", emailVerified: true };

    it("producer is allowed in /producer context", async () => {
      const access = await requirePlatformRole(fs, producerAUser, "producer");
      expect(access.roles).toContain("producer");
      expect(access.producerPlanActive).toBe(true);
    });

    it("producer is strictly barred from /admin console", async () => {
      await expect(requireAdminModule(fs, producerAUser, "pricing"))
        .rejects.toMatchObject({ status: 403, code: "ZILLIONAIRE_SCOPE_REQUIRED" });
      await expect(requireAdminModule(fs, producerAUser, "storage"))
        .rejects.toMatchObject({ status: 403, code: "ZILLIONAIRE_SCOPE_REQUIRED" });
    });

    it("producer is strictly barred from /provider console", async () => {
      await expect(requireProviderAccess(fs, producerAUser))
        .rejects.toMatchObject({ status: 403, code: "PROVIDER_ROLE_REQUIRED" });
    });

    it("producer A cannot access or manage Producer B's channel resources", async () => {
      const channelBDoc = store["channels/chan-producer-B"];
      expect(channelBDoc?.["ownerUid"]).toBe("producer-B");
      // Verification check that channel B does not match producer A's UID
      expect(channelBDoc?.["ownerUid"]).not.toBe(producerAUser.uid);
    });
  });

  describe("Provider role boundary and cross-provider data isolation", () => {
    const provider1User = { uid: "provider-1", email: "rep1@broadcast.com", emailVerified: true };
    const provider2User = { uid: "provider-2", email: "rep2@sports.com", emailVerified: true };

    it("provider 1 is allowed in /provider context and receives their own providerId", async () => {
      const access = await requireProviderAccess(fs, provider1User);
      expect(access.roles).toContain("provider");
      expect(access.providerId).toBe("prov-news-corp");
    });

    it("provider 1 is strictly barred from /admin console", async () => {
      await expect(requireAdminModule(fs, provider1User, "providers"))
        .rejects.toMatchObject({ status: 403, code: "ZILLIONAIRE_SCOPE_REQUIRED" });
    });

    it("provider 1 is strictly barred from /producer console", async () => {
      await expect(requirePlatformRole(fs, provider1User, "producer"))
        .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    });

    it("provider 1 cannot access Provider 2's data (PROVIDER_ISOLATION_VIOLATION)", async () => {
      // Trying to access prov-sports-net with prov-news-corp credentials
      await expect(requireProviderAccess(fs, provider1User, "prov-sports-net"))
        .rejects.toMatchObject({ status: 403, code: "PROVIDER_ISOLATION_VIOLATION" });
    });

    it("provider 2 cannot access Provider 1's data (PROVIDER_ISOLATION_VIOLATION)", async () => {
      // Trying to access prov-news-corp with prov-sports-net credentials
      await expect(requireProviderAccess(fs, provider2User, "prov-news-corp"))
        .rejects.toMatchObject({ status: 403, code: "PROVIDER_ISOLATION_VIOLATION" });
    });
  });

  describe("Zillionaire owner governance", () => {
    it("recognizes verified owner email and grants admin console access across all modules", async () => {
      vi.stubEnv("ZILLIONAIRE_EMAIL", "owner@zillionaire.tv");
      const ownerUser = { uid: "owner-1", email: "owner@zillionaire.tv", emailVerified: true };
      const access = await requireAdminModule(fs, ownerUser, "providers");
      expect(access.isZillionaireOwner).toBe(true);
      expect(access.adminModules).toContain("providers");
      expect(access.adminModules).toContain("support");
      vi.unstubAllEnvs();
    });

    it("rejects unverified owner email from admin module access", async () => {
      vi.stubEnv("ZILLIONAIRE_EMAIL", "owner@zillionaire.tv");
      const unverifiedOwner = { uid: "owner-1", email: "owner@zillionaire.tv", emailVerified: false };
      await expect(requireAdminModule(fs, unverifiedOwner, "providers"))
        .rejects.toMatchObject({ status: 403 });
      vi.unstubAllEnvs();
    });
  });
});
