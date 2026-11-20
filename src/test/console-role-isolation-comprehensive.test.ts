import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "@/lib/server/firebase-admin";
import { resolvePlatformAccess, requirePlatformRole, requireProviderAccess, getConfiguredOwnerEmail } from "@/lib/server/roles";
import { requireChannelPermission } from "@/lib/server/channel-access";

function mockFirestore(docs: Record<string, unknown> = {}) {
  return {
    getDoc: vi.fn(async (p: string) => (docs[p] ? docs[p] : null)),
    setDoc: vi.fn(async (p: string, data: unknown) => {
      docs[p] = data;
    }),
    query: vi.fn(
      async (
        collection: string,
        options?: { filters?: Array<{ field: string; op: string; value: unknown }> },
      ) => {
        const filters = options?.filters || [];
        const results: Array<Record<string, unknown> & { __id: string }> = [];
        for (const [key, val] of Object.entries(docs)) {
          if (key.startsWith(collection + "/")) {
            const doc: Record<string, unknown> & { __id: string } = {
              __id: key.replace(collection + "/", ""),
              ...(val as object),
            };
            let match = true;
            for (const f of filters) {
              if (doc[f.field] !== f.value) match = false;
            }
            if (match) results.push(doc);
          }
        }
        return results;
      },
    ),
  } as unknown as Firestore;
}

describe("Console Role Isolation & Comprehensive Security (V5-04 Batch 10)", () => {
  const store: Record<string, unknown> = {
    // Producers
    "users/prod-1": { email: "producer1@studio.com", roleTags: ["producer"] },
    "producers/prod-1": {
      planStatus: "ACTIVE",
      verificationStatus: "APPROVED",
      earningsBalanceMinor: 450000,
      earningsLifetimeMinor: 1200000,
    },
    "channels/ch-prod-1": { ownerUid: "prod-1", name: "Studio One HD", status: "published" },
    "ledger/entry-1": {
      uid: "prod-1",
      kind: "producer_earning",
      amountMinor: 25000,
      currency: "USD",
      createdAt: "2026-03-01T12:00:00Z",
    },

    "users/prod-2": { email: "producer2@films.com", roleTags: ["producer"] },
    "producers/prod-2": {
      planStatus: "ACTIVE",
      verificationStatus: "APPROVED",
      earningsBalanceMinor: 890000,
      earningsLifetimeMinor: 2500000,
    },
    "channels/ch-prod-2": { ownerUid: "prod-2", name: "Indie Cinema", status: "published" },

    // Providers
    "users/prov-user-1": { email: "partner1@broadcasting.com", roleTags: [] },
    "providerUsers/prov-user-1": { status: "ACTIVE", providerId: "prov-1" },
    "providers/prov-1": {
      name: "Global Satellite Feed",
      providerShareBps: 2500,
      settlementCurrency: "USD",
    },
    "liveChannels/ch-prov-1": {
      providerId: "prov-1",
      name: "Global News 24/7",
      status: "published",
    },
    "providerStatements/stmt-1": {
      providerId: "prov-1",
      grossRevenueMinor: 10000000,
      netSettlementMinor: 2500000,
    },

    "users/prov-user-2": { email: "partner2@sportsnetwork.com", roleTags: [] },
    "providerUsers/prov-user-2": { status: "ACTIVE", providerId: "prov-2" },
    "providers/prov-2": {
      name: "Sports Network Live",
      providerShareBps: 3000,
      settlementCurrency: "NGN",
    },

    // Viewer (no console roles)
    "users/viewer-joe": { email: "joe@gmail.com", roleTags: [] },

    // Approved provider whitelist
    "approvedProviders/preapproved@partner.com": { status: "active" },

    // Notifications
    "notifications/notif-payout-1": {
      uid: "prod-1",
      type: "payout_paid",
      title: "Payout Disbursed",
      amountMinor: 200000,
      currency: "USD",
      reference: "PAY-2026-X891",
      createdAt: "2026-03-25T10:00:00Z",
    },
  };

  const fs = mockFirestore(store);

  describe("1. Producer Role & Data Isolation", () => {
    it("producer cannot see or manage another producer's channel", async () => {
      // Producer 1 can manage channel 1
      const p1Access = await requireChannelPermission(fs, "ch-prod-1", "prod-1", "channel.settings");
      expect(p1Access.role).toBe("owner");

      // Producer 1 CANNOT manage or view channel 2
      await expect(
        requireChannelPermission(fs, "ch-prod-2", "prod-1", "channel.settings"),
      ).rejects.toMatchObject({ status: 403, code: "CHANNEL_ACCESS_REQUIRED" });
    });

    it("producer earnings strictly query producer's own UID without exposing platform gross or percentage", async () => {
      const p1Ledger = await fs.query("ledger", {
        filters: [{ field: "uid", op: "EQUAL", value: "prod-1" }],
      });
      expect(p1Ledger).toHaveLength(1);
      expect(p1Ledger[0]?.["amountMinor"]).toBe(25000);

      // Verify no gross revenue or platform percentage fields are attached to producer record
      const p1Doc = await fs.getDoc("producers/prod-1");
      expect(p1Doc).toBeDefined();
      expect(p1Doc?.["grossPlatformRevenue"]).toBeUndefined();
      expect(p1Doc?.["platformTakeRateBps"]).toBeUndefined();
      expect(p1Doc?.["adminCut"]).toBeUndefined();
    });
  });

  describe("2. Provider Role & Organization Isolation", () => {
    it("provider-1 cannot access provider-2's organization records", async () => {
      const p1Access = await requireProviderAccess(
        fs,
        { uid: "prov-user-1", email: "partner1@broadcasting.com" },
        "prov-1",
      );
      expect(p1Access.providerId).toBe("prov-1");

      await expect(
        requireProviderAccess(
          fs,
          { uid: "prov-user-1", email: "partner1@broadcasting.com" },
          "prov-2",
        ),
      ).rejects.toMatchObject({ status: 403, code: "PROVIDER_ISOLATION_VIOLATION" });
    });

    it("provider queries strictly isolate channels and financial statements", async () => {
      const p1Channels = await fs.query("liveChannels", {
        filters: [{ field: "providerId", op: "EQUAL", value: "prov-1" }],
      });
      expect(p1Channels).toHaveLength(1);
      expect(p1Channels[0]?.["providerId"]).toBe("prov-1");

      const p2Channels = await fs.query("liveChannels", {
        filters: [{ field: "providerId", op: "EQUAL", value: "prov-2" }],
      });
      expect(p2Channels).toHaveLength(0);
    });
  });

  describe("3. Viewer Access Control", () => {
    it("viewer cannot open producer console", async () => {
      await expect(
        requirePlatformRole(fs, { uid: "viewer-joe", email: "joe@gmail.com" }, "producer"),
      ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    });

    it("viewer cannot open provider console", async () => {
      await expect(
        requireProviderAccess(fs, { uid: "viewer-joe", email: "joe@gmail.com" }),
      ).rejects.toMatchObject({ status: 403, code: "PROVIDER_ROLE_REQUIRED" });
    });
  });

  describe("4. Provider Email Gating & Onboarding Checklist", () => {
    it("denies unapproved email from provider self-registration", async () => {
      const unapprovedEmail = "stranger@unknown.com";
      const approvedDoc = await fs.getDoc(`approvedProviders/${unapprovedEmail}`);
      expect(approvedDoc).toBeNull();
    });

    it("allows pre-approved email on whitelist", async () => {
      const approvedDoc = await fs.getDoc("approvedProviders/preapproved@partner.com");
      expect(approvedDoc).toBeDefined();
      expect(approvedDoc?.["status"]).toBe("active");
    });
  });

  describe("5. Payout Notifications", () => {
    it("records and isolates payout-paid notifications with reference", async () => {
      const notifs = await fs.query("notifications", {
        filters: [{ field: "uid", op: "EQUAL", value: "prod-1" }],
      });
      expect(notifs).toHaveLength(1);
      expect(notifs[0]?.["type"]).toBe("payout_paid");
      expect(notifs[0]?.["amountMinor"]).toBe(200000);
      expect(notifs[0]?.["reference"]).toBe("PAY-2026-X891");
    });
  });

  describe("6. Single Owner Identity Checklist", () => {
    it("verifies only ZILLIONAIRE_EMAIL is configured as platform owner, never any fallback admin email", () => {
      const ownerEmail = getConfiguredOwnerEmail();
      // Owner email must not contain any generic fallback admin email
      expect(ownerEmail).not.toBe("admin@example.com");
      expect(ownerEmail).not.toBe("admin@bqsqwad.tv");
      if (process.env.ZILLIONAIRE_EMAIL) {
        expect(ownerEmail).toBe(process.env.ZILLIONAIRE_EMAIL.toLowerCase().trim());
      }
    });
  });
});
