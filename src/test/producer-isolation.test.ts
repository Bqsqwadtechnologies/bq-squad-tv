import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "@/lib/server/firebase-admin";
import { resolvePlatformAccess, requirePlatformRole } from "@/lib/server/roles";
import { getChannelAccess, requireChannelPermission } from "@/lib/server/channel-access";
import { requireAuthorizedChannelUpload } from "@/lib/server/producer-upload-access";

function mockFirestore(docs: Record<string, unknown> = {}) {
  return {
    getDoc: vi.fn(async (p: string) => docs[p] ? docs[p] : null),
    query: vi.fn(async (collection: string, options: any) => {
      const filters = options?.filters || [];
      const results: any[] = [];
      for (const [key, val] of Object.entries(docs)) {
        if (key.startsWith(collection + "/")) {
          const doc = { __id: key.replace(collection + "/", ""), ...(val as object) };
          let match = true;
          for (const f of filters) {
            if (doc[f.field] !== f.value) match = false;
          }
          if (match) results.push(doc);
        }
      }
      return results;
    }),
  } as unknown as Firestore;
}

describe("Producer Isolation and Channel Authorization (Batch 05)", () => {
  const store = {
    // Producer Alpha (Active plan, Approved verification)
    "users/producer-alpha": { email: "alpha@prod.com", roleTags: ["producer"] },
    "producers/producer-alpha": { planStatus: "ACTIVE", verificationStatus: "APPROVED", balanceMinor: 50000 },
    "channels/chan-alpha": { ownerUid: "producer-alpha", title: "Alpha Studio" },
    "contentAssets/asset-alpha-1": { channelId: "chan-alpha", ownerUid: "producer-alpha", status: "uploaded_pending_transcode" },
    "ledger/entry-alpha": { uid: "producer-alpha", amountMinor: 25000 },

    // Producer Beta (Active plan, Approved verification)
    "users/producer-beta": { email: "beta@prod.com", roleTags: ["producer"] },
    "producers/producer-beta": { planStatus: "ACTIVE", verificationStatus: "APPROVED", balanceMinor: 80000 },
    "channels/chan-beta": { ownerUid: "producer-beta", title: "Beta Films" },
    "contentAssets/asset-beta-1": { channelId: "chan-beta", ownerUid: "producer-beta", status: "uploaded_pending_transcode" },
    "ledger/entry-beta": { uid: "producer-beta", amountMinor: 40000 },

    // Producer Gamma (Unpaid or Pending Verification)
    "users/producer-unpaid": { email: "unpaid@prod.com", roleTags: ["producer"] },
    "producers/producer-unpaid": { planStatus: "PENDING", verificationStatus: "PENDING" },

    // Delegated Team Member on Alpha Channel (Uploader role)
    "channels/chan-alpha/members/team-uploader": {
      status: "ACTIVE",
      role: "uploader",
      permissions: ["video.upload", "analytics.read.own"],
    },
  };

  const fs = mockFirestore(store);

  describe("Producer plan and verification requirements", () => {
    it("producer-alpha with active plan and approved verification has producer role", async () => {
      const access = await resolvePlatformAccess(fs, "producer-alpha", "alpha@prod.com");
      expect(access.roles).toContain("producer");
      expect(access.producerPlanActive).toBe(true);
    });

    it("unpaid or unverified producer is barred from producer role actions", async () => {
      const access = await resolvePlatformAccess(fs, "producer-unpaid", "unpaid@prod.com");
      expect(access.roles).not.toContain("producer");
      await expect(requirePlatformRole(fs, { uid: "producer-unpaid", email: "unpaid@prod.com" }, "producer"))
        .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    });
  });

  describe("Channel ownership and team delegation boundaries", () => {
    it("allows producer-alpha full owner permissions on their own channel chan-alpha", async () => {
      const access = await getChannelAccess(fs, "chan-alpha", "producer-alpha");
      expect(access.role).toBe("owner");
      expect(access.permissions).toContain("channel.settings");
      expect(access.permissions).toContain("schedule.write");
      expect(access.permissions).toContain("video.upload");
    });

    it("strictly bars producer-beta from producer-alpha's channel (CHANNEL_ACCESS_REQUIRED)", async () => {
      await expect(getChannelAccess(fs, "chan-alpha", "producer-beta"))
        .rejects.toMatchObject({ status: 403, code: "CHANNEL_ACCESS_REQUIRED" });
    });

    it("allows delegated team member on chan-alpha with scoped permissions", async () => {
      const access = await getChannelAccess(fs, "chan-alpha", "team-uploader");
      expect(access.role).toBe("uploader");
      expect(access.permissions).toContain("video.upload");
      expect(access.permissions).not.toContain("schedule.write");
      expect(access.permissions).not.toContain("channel.delete");
    });

    it("delegated team member cannot delete channel (owner-only permission invariant)", async () => {
      await expect(requireChannelPermission(fs, "chan-alpha", "team-uploader", "channel.delete"))
        .rejects.toMatchObject({ status: 403, code: "CHANNEL_PERMISSION_REQUIRED" });
    });
  });

  describe("Resource isolation across earnings, assets, and uploads", () => {
    it("producer-alpha upload authorization succeeds for chan-alpha and fails for chan-beta", async () => {
      await expect(requireAuthorizedChannelUpload(fs, "chan-alpha", {
        uid: "producer-alpha", email: "alpha@prod.com", emailVerified: true,
      })).resolves.toBeUndefined();

      await expect(requireAuthorizedChannelUpload(fs, "chan-beta", {
        uid: "producer-alpha", email: "alpha@prod.com", emailVerified: true,
      })).rejects.toMatchObject({ status: 403 });
    });

    it("queries for ledger entries return only producer-alpha records", async () => {
      const alphaLedger = await fs.query("ledger", {
        filters: [{ field: "uid", op: "EQUAL", value: "producer-alpha" }],
      });
      expect(alphaLedger).toHaveLength(1);
      expect(alphaLedger[0]["amountMinor"]).toBe(25000);

      // Verify no leak of beta entries
      const containsBeta = alphaLedger.some(e => e["uid"] === "producer-beta");
      expect(containsBeta).toBe(false);
    });
  });
});
