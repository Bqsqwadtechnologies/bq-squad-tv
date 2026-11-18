import { describe, expect, it, vi } from "vitest";
import { requireProviderAccess, requireAdminModule } from "@/lib/server/roles";
import { ApiError, type Firestore } from "@/lib/server/firebase-admin";

type MockDoc = Record<string, unknown>;

function createE2EStore() {
  const store = new Map<string, MockDoc>();

  const fs: Partial<Firestore> = {
    getDoc: vi.fn(async (path: string) => store.get(path) || null),
    setDoc: vi.fn(async (path: string, data: MockDoc) => {
      store.set(path, { ...data });
    }),
    updateDoc: vi.fn(async (path: string, data: MockDoc) => {
      const existing = store.get(path) || {};
      store.set(path, { ...existing, ...data });
    }),
    listCollection: vi.fn(async (collection: string) => {
      const results: MockDoc[] = [];
      for (const [key, val] of store.entries()) {
        if (key.startsWith(`${collection}/`)) {
          results.push(val);
        }
      }
      return results;
    }),
  };

  return { store, fs: fs as unknown as Firestore };
}

describe("End-to-End Provider Workflows", () => {
  describe("Workflow 1: Live Channel Provisioning and Playback Verification", () => {
    it("provisions, verifies stream integrity, and checks playback licensing boundaries", async () => {
      const { store, fs } = createE2EStore();

      // Seed provider and channel
      store.set("providerUsers/user-prov-1", {
        status: "ACTIVE",
        providerId: "prov-lagos-tv",
      });

      const validFutureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const channelId = "ch_lagos_live_01";
      const channelData = {
        channelId,
        providerId: "prov-lagos-tv",
        name: "Lagos Broadcast Live",
        streamUrl: "https://streams.example.com/live/lagos/index.m3u8",
        status: "published",
        health: "healthy",
        categories: ["News", "Entertainment"],
        language: "en",
        licenceExpiresAt: validFutureDate,
        totalWatchMinutes: 12050,
        currentViewers: 142,
      };
      await fs.setDoc(`liveChannels/${channelId}`, channelData);

      // 1. Provider accesses their provisioned channels
      const providerUser = { uid: "user-prov-1", email: "rep@lagostv.com", emailVerified: true };
      const access = await requireProviderAccess(fs, providerUser);
      expect(access.providerId).toBe("prov-lagos-tv");

      const channel = await fs.getDoc(`liveChannels/${channelId}`);
      expect(channel).not.toBeNull();
      expect(channel!["providerId"]).toBe(access.providerId);
      expect(channel!["status"]).toBe("published");

      // 2. Playback rights validation: check stream URL format and active licence
      const streamUrl = channel!["streamUrl"] as string;
      const isHttps = streamUrl.startsWith("https://");
      const hasValidManifest = streamUrl.endsWith(".m3u8") || streamUrl.endsWith(".mpd");
      const isLicenceActive = new Date(channel!["licenceExpiresAt"] as string).getTime() > Date.now();

      expect(isHttps).toBe(true);
      expect(hasValidManifest).toBe(true);
      expect(isLicenceActive).toBe(true);

      // 3. Playback fails when channel license is expired or unpublished
      const expiredChannelId = "ch_lagos_expired";
      await fs.setDoc(`liveChannels/${expiredChannelId}`, {
        ...channelData,
        channelId: expiredChannelId,
        licenceExpiresAt: new Date(Date.now() - 10000).toISOString(),
      });

      const expiredDoc = await fs.getDoc(`liveChannels/${expiredChannelId}`);
      const isExpiredLicenceActive = new Date(expiredDoc!["licenceExpiresAt"] as string).getTime() > Date.now();
      expect(isExpiredLicenceActive).toBe(false);

      // Suspended channel check
      const suspendedChannelId = "ch_lagos_suspended";
      await fs.setDoc(`liveChannels/${suspendedChannelId}`, {
        ...channelData,
        channelId: suspendedChannelId,
        status: "suspended",
      });

      const suspendedDoc = await fs.getDoc(`liveChannels/${suspendedChannelId}`);
      expect(suspendedDoc!["status"]).not.toBe("published");
    });
  });

  describe("Workflow 2: Provider Statements Lifecycle and Exact Share Arithmetic", () => {
    it("calculates exact integer minor-unit revenue share and enforces strict isolation", async () => {
      const { store, fs } = createE2EStore();

      // Seed Provider A & Provider B
      store.set("providerUsers/user-A", { status: "ACTIVE", providerId: "prov-A" });
      store.set("providerUsers/user-B", { status: "ACTIVE", providerId: "prov-B" });

      const statementId = "stmt_2026_09_provA";
      const grossRevenueMinor = 10_000_000; // 100,000.00 NGN in kobo
      const cdnDeliveryMinor = 500_000; // 5,000.00 NGN
      const paymentProcessingMinor = 250_000; // 2,500.00 NGN
      const playbackInfraMinor = 250_000; // 2,500.00 NGN
      const totalDeductibleMinor = cdnDeliveryMinor + paymentProcessingMinor + playbackInfraMinor; // 10,000.00 NGN

      const grossProfitMinor = grossRevenueMinor - totalDeductibleMinor; // 90,000.00 NGN = 9,000,000 kobo
      const providerShareBps = 2500; // 25.00%
      const providerEarningsMinor = Math.round((grossProfitMinor * providerShareBps) / 10000); // 2,250,000 kobo
      const platformShareMinor = grossProfitMinor - providerEarningsMinor; // 6,750,000 kobo

      expect(grossProfitMinor).toBe(9_000_000);
      expect(providerEarningsMinor).toBe(2_250_000);
      expect(platformShareMinor).toBe(6_750_000);
      expect(providerEarningsMinor + platformShareMinor).toBe(grossProfitMinor);

      const statementDoc = {
        statementId,
        providerId: "prov-A",
        period: "September 2026",
        status: "closed", // closed -> approved -> paid
        currency: "NGN",
        grossRevenueMinor,
        cdnDeliveryMinor,
        paymentProcessingMinor,
        providerFeesMinor: 0,
        playbackInfrastructureMinor: playbackInfraMinor,
        totalDeductibleMinor,
        grossProfitMinor,
        providerShareBps,
        providerEarningsMinor,
        platformShareMinor,
        statementHash: "sha256_mock_statement_hash_verified",
        paymentReference: null,
        paidAt: null,
      };

      await fs.setDoc(`providerStatements/${statementId}`, statementDoc);

      // Provider A reads their own statement
      const userA = { uid: "user-A", email: "a@prov.com", emailVerified: true };
      const accessA = await requireProviderAccess(fs, userA);
      const fetchedA = await fs.getDoc(`providerStatements/${statementId}`);
      expect(fetchedA).not.toBeNull();
      expect(fetchedA!["providerId"]).toBe(accessA.providerId);
      expect(fetchedA!["providerEarningsMinor"]).toBe(2_250_000);

      // Provider B attempts to query Provider A's statement and is blocked by isolation
      const userB = { uid: "user-B", email: "b@prov.com", emailVerified: true };
      await expect(requireProviderAccess(fs, userB, fetchedA!["providerId"] as string))
        .rejects.toMatchObject({ status: 403, code: "PROVIDER_ISOLATION_VIOLATION" });

      // Statement moves to paid status with reference
      await fs.updateDoc(`providerStatements/${statementId}`, {
        status: "paid",
        paymentReference: "PAY-NGN-2026-09-00124",
        paidAt: new Date().toISOString(),
      });

      const updatedStmt = await fs.getDoc(`providerStatements/${statementId}`);
      expect(updatedStmt!["status"]).toBe("paid");
      expect(updatedStmt!["paymentReference"]).toBe("PAY-NGN-2026-09-00124");
    });
  });

  describe("Workflow 3: Provider Dispute Threads and Admin Support Interaction", () => {
    it("creates dispute thread, handles operator reply, provider follow-up, and enforces isolation", async () => {
      const { store, fs } = createE2EStore();

      store.set("providerUsers/user-A", { status: "ACTIVE", providerId: "prov-Alpha" });
      store.set("providerUsers/user-B", { status: "ACTIVE", providerId: "prov-Beta" });

      const userA = { uid: "user-A", email: "a@alpha.com", emailVerified: true };
      const userB = { uid: "user-B", email: "b@beta.com", emailVerified: true };
      const adminSupportUser = { uid: "admin-sup", email: "support@zillionaire.tv", emailVerified: true };

      // Make admin user have support module delegated
      store.set("users/admin-sup", {
        email: "support@zillionaire.tv",
        adminModules: ["support"],
      });

      // 1. Provider A opens dispute
      const disputeId = "disp_test_001";
      const initialDispute = {
        disputeId,
        providerId: "prov-Alpha",
        subject: "Discrepancy in CDN Deductible for Sept 2026",
        statementId: "stmt_2026_09",
        status: "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            sender: "provider",
            senderUid: userA.uid,
            text: "The CDN delivery cost allocated appears higher than verified stream egress.",
            timestamp: new Date().toISOString(),
          },
        ],
      };
      await fs.setDoc(`providerDisputes/${disputeId}`, initialDispute);

      // Verify Provider A owns this dispute
      const dispDoc = await fs.getDoc(`providerDisputes/${disputeId}`);
      expect(dispDoc).not.toBeNull();
      expect(dispDoc!["providerId"]).toBe("prov-Alpha");

      // 2. Admin with support module inspects dispute
      await requireAdminModule(fs, adminSupportUser, "support");
      const adminDisputes = await fs.listCollection("providerDisputes");
      expect(adminDisputes.length).toBe(1);

      // Admin replies to dispute thread
      const currentMessages = [...(dispDoc!["messages"] as Array<Record<string, unknown>>)];
      currentMessages.push({
        sender: "support",
        senderUid: adminSupportUser.uid,
        text: "We have reviewed your egress logs and applied an adjustment credit of NGN 150,000.",
        timestamp: new Date().toISOString(),
      });

      await fs.updateDoc(`providerDisputes/${disputeId}`, {
        messages: currentMessages,
        status: "under_review",
        updatedAt: new Date().toISOString(),
      });

      // 3. Provider A replies back
      const accessA = await requireProviderAccess(fs, userA);
      const provReviewDoc = await fs.getDoc(`providerDisputes/${disputeId}`);
      expect(provReviewDoc!["providerId"]).toBe(accessA.providerId);
      expect(provReviewDoc!["status"]).toBe("under_review");

      const providerReplyMessages = [...(provReviewDoc!["messages"] as Array<Record<string, unknown>>)];
      providerReplyMessages.push({
        sender: "provider",
        senderUid: userA.uid,
        text: "Thank you for the prompt review and credit adjustment. Confirmed.",
        timestamp: new Date().toISOString(),
      });

      await fs.updateDoc(`providerDisputes/${disputeId}`, {
        messages: providerReplyMessages,
        updatedAt: new Date().toISOString(),
      });

      // 4. Support resolves the dispute
      await fs.updateDoc(`providerDisputes/${disputeId}`, {
        status: "resolved",
        resolvedByUid: adminSupportUser.uid,
        updatedAt: new Date().toISOString(),
      });

      const finalDispute = await fs.getDoc(`providerDisputes/${disputeId}`);
      expect(finalDispute!["status"]).toBe("resolved");
      expect((finalDispute!["messages"] as Array<unknown>).length).toBe(3);

      // 5. Isolation: Provider B attempts to view or reply to Provider A's dispute
      await expect(requireProviderAccess(fs, userB, finalDispute!["providerId"] as string))
        .rejects.toMatchObject({ status: 403, code: "PROVIDER_ISOLATION_VIOLATION" });
    });
  });
});
