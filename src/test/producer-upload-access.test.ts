import { describe, expect, it, vi } from "vitest";
import { requireAuthorizedChannelUpload } from "@/lib/server/producer-upload-access";
import type { Firestore } from "@/lib/server/firebase-admin";

function firestore(documents: Record<string, Record<string, unknown> | null>) {
  return {
    getDoc: vi.fn(async (path: string) => documents[path] ?? null),
  } as unknown as Firestore;
}

describe("authorized channel uploads", () => {
  it("allows a delegated ZILLIONAIRE content operator to upload to a platform channel", async () => {
    const fs = firestore({
      "channels/platform-channel": { ownerUid: "platform" },
      "users/operator": { roleTags: [], adminModules: ["content"] },
      "producers/operator": null,
    });
    await expect(requireAuthorizedChannelUpload(fs, "platform-channel", {
      uid: "operator", email: "operator@example.com", emailVerified: true,
    })).resolves.toBeUndefined();
  });

  it("allows a delegated channels operator without content scope", async () => {
    const fs = firestore({
      "channels/platform-channel": { ownerUid: "platform" },
      "users/operator": { roleTags: [], adminModules: ["channels"] },
      "producers/operator": null,
    });
    await expect(requireAuthorizedChannelUpload(fs, "platform-channel", {
      uid: "operator", email: "operator@example.com", emailVerified: true,
    })).resolves.toBeUndefined();
  });

  it("does not turn a storage or role-resolution error into fallback authorization", async () => {
    const fs = {
      getDoc: vi.fn(async (path: string) => {
        if (path === "channels/platform-channel") return { ownerUid: "platform" };
        throw new Error("Firestore unavailable");
      }),
    } as unknown as Firestore;
    await expect(requireAuthorizedChannelUpload(fs, "platform-channel", {
      uid: "operator", email: "operator@example.com", emailVerified: true,
    })).rejects.toThrow("Firestore unavailable");
  });

  it("rejects platform uploads when the delegated account has neither required module", async () => {
    const fs = firestore({
      "channels/platform-channel": { ownerUid: "platform" },
      "users/operator": { roleTags: [], adminModules: ["pricing"] },
      "producers/operator": null,
    });
    await expect(requireAuthorizedChannelUpload(fs, "platform-channel", {
      uid: "operator", email: "operator@example.com", emailVerified: true,
    })).rejects.toMatchObject({ status: 403, code: "ZILLIONAIRE_SCOPE_REQUIRED" });
  });

  it("requires the producer channel owner to be active and legally verified", async () => {
    const fs = firestore({
      "channels/producer-channel": { ownerUid: "producer-1" },
      "producers/producer-1": { planStatus: "ACTIVE", verificationStatus: "PENDING" },
    });
    await expect(requireAuthorizedChannelUpload(fs, "producer-channel", {
      uid: "producer-1", email: "producer@example.com", emailVerified: true,
    })).rejects.toMatchObject({ status: 403, code: "PRODUCER_VERIFICATION_REQUIRED" });
  });

  it("allows the verified producer account that owns an active channel", async () => {
    const fs = firestore({
      "channels/producer-channel": { ownerUid: "producer-1" },
      "producers/producer-1": { planStatus: "ACTIVE", verificationStatus: "APPROVED" },
    });
    await expect(requireAuthorizedChannelUpload(fs, "producer-channel", {
      uid: "producer-1", email: "producer@example.com", emailVerified: true,
    })).resolves.toBeUndefined();
  });

  it("rejects malformed channel ownership instead of treating it as a producer channel", async () => {
    const fs = firestore({
      "channels/producer-channel": { ownerUid: { uid: "producer-1" } },
    });
    await expect(requireAuthorizedChannelUpload(fs, "producer-channel", {
      uid: "producer-1", email: "producer@example.com", emailVerified: true,
    })).rejects.toMatchObject({ status: 409, code: "CHANNEL_OWNER_INVALID" });
  });

  it("requires video.upload membership permission for producer channel team members", async () => {
    const fs = firestore({
      "channels/producer-channel": { ownerUid: "producer-1" },
      "producers/producer-1": { planStatus: "ACTIVE", verificationStatus: "APPROVED" },
      "channels/producer-channel/members/uploader": { status: "ACTIVE", role: "scheduler", permissions: ["schedule.write"] },
    });
    await expect(requireAuthorizedChannelUpload(fs, "producer-channel", {
      uid: "uploader", email: "uploader@example.com", emailVerified: true,
    })).rejects.toMatchObject({ status: 403, code: "CHANNEL_PERMISSION_REQUIRED" });
  });

  it("allows an authorized producer team uploader", async () => {
    const fs = firestore({
      "channels/producer-channel": { ownerUid: "producer-1" },
      "producers/producer-1": { planStatus: "ACTIVE", verificationStatus: "APPROVED" },
      "channels/producer-channel/members/uploader": { status: "ACTIVE", role: "uploader", permissions: ["video.upload"] },
    });
    await expect(requireAuthorizedChannelUpload(fs, "producer-channel", {
      uid: "uploader", email: "uploader@example.com", emailVerified: true,
    })).resolves.toBeUndefined();
  });
});
