import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "@/lib/server/firebase-admin";
import { resolvePlatformAccess, requirePlatformRole } from "@/lib/server/roles";
import { requireChannelPermission } from "@/lib/server/channel-access";

function mockFirestore(docs: Record<string, unknown> = {}) {
  return {
    getDoc: vi.fn(async (p: string) => (docs[p] ? docs[p] : null)),
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

describe("Producer Role & Channel Isolation (Batch 05)", () => {
  const store = {
    // Producer with verified KYC, role tag, and active subscription
    "users/prod-active": { email: "active@producer.com", roleTags: ["producer"] },
    "producers/prod-active": { planStatus: "ACTIVE", verificationStatus: "APPROVED" },

    // Producer with pending KYC verification
    "users/prod-pending": { email: "pending@producer.com", roleTags: ["producer"] },
    "producers/prod-pending": { planStatus: "ACTIVE", verificationStatus: "PENDING" },

    // Producer with expired subscription
    "users/prod-expired": { email: "expired@producer.com", roleTags: ["producer"] },
    "producers/prod-expired": { planStatus: "EXPIRED", verificationStatus: "APPROVED" },

    // Viewer (no producer doc)
    "users/viewer-1": { email: "viewer@example.com", roleTags: [] },

    // Channels
    "channels/ch-alpha": { ownerUid: "prod-active", name: "Alpha Channel", status: "published" },
    "channels/ch-beta": { ownerUid: "prod-other", name: "Beta Channel", status: "published" },

    // Delegated channel team member
    "channels/ch-alpha/members/uploader-uid": { role: "uploader", status: "ACTIVE" },
  };

  const fs = mockFirestore(store);

  describe("Producer role resolution and plan gating", () => {
    it("grants producer role when subscription is ACTIVE and verification is APPROVED", async () => {
      const access = await resolvePlatformAccess(fs, "prod-active", "active@producer.com");
      expect(access.roles).toContain("producer");
      expect(access.roles).toContain("viewer");
    });

    it("denies producer role when verification is PENDING", async () => {
      const access = await resolvePlatformAccess(fs, "prod-pending", "pending@producer.com");
      expect(access.roles).not.toContain("producer");
    });

    it("denies producer role when subscription is EXPIRED", async () => {
      const access = await resolvePlatformAccess(fs, "prod-expired", "expired@producer.com");
      expect(access.roles).not.toContain("producer");
    });

    it("throws 403 FORBIDDEN when user is not an active producer", async () => {
      await expect(
        requirePlatformRole(fs, { uid: "viewer-1", email: "viewer@example.com" }, "producer"),
      ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    });
  });

  describe("Channel ownership and team delegation boundaries", () => {
    it("allows channel owner full access including manage_team and edit_channel", async () => {
      const access = await requireChannelPermission(
        fs,
        "ch-alpha",
        "prod-active",
        "channel.settings",
      );
      expect(access.role).toBe("owner");
      expect(access.permissions).toContain("channel.delete");
      expect(access.permissions).toContain("ownership.transfer");
    });

    it("allows active delegated uploader with video.upload", async () => {
      const access = await requireChannelPermission(fs, "ch-alpha", "uploader-uid", "video.upload");
      expect(access.role).toBe("uploader");
      expect(access.permissions).toContain("video.upload");
      expect(access.permissions).not.toContain("channel.delete");
    });

    it("denies delegated uploader from channel.delete", async () => {
      await expect(
        requireChannelPermission(fs, "ch-alpha", "uploader-uid", "channel.delete"),
      ).rejects.toMatchObject({ status: 403, code: "CHANNEL_PERMISSION_REQUIRED" });
    });

    it("strictly isolates channels: producer cannot access another producer channel", async () => {
      await expect(
        requireChannelPermission(fs, "ch-beta", "prod-active", "video.upload"),
      ).rejects.toMatchObject({ status: 403, code: "CHANNEL_ACCESS_REQUIRED" });
    });
  });
});
