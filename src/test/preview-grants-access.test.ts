import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrivatePreviewGrant } from "@/lib/server/preview-grants";
import type { Firestore } from "@/lib/server/firebase-admin";

describe("private preview grants", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("recognises the verified Zillionaire owner without a consoleAccounts mirror document", async () => {
    vi.stubEnv("ZILLIONAIRE_EMAIL", "owner@bqsqwad.tv");
    const getDoc = vi.fn(async (path: string) => {
      if (path === "contentAssets/asset-1") {
        return { ownerUid: "producer-1", status: "ready", hlsMasterUrl: "/private/asset-1/master.m3u8" };
      }
      if (path === "users/owner-1") return { email: "owner@bqsqwad.tv" };
      return null;
    });
    const fs = { getDoc } as unknown as Firestore;

    const grant = await createPrivatePreviewGrant(
      fs,
      { uid: "owner-1", email: "owner@bqsqwad.tv", emailVerified: true },
      "asset",
      "asset-1",
    );

    expect(grant.streamUrl).toBe("/private/asset-1/master.m3u8");
    expect(grant.previewPath).toContain("/content/asset-1?preview=true&previewToken=");
    expect(getDoc).not.toHaveBeenCalledWith("consoleAccounts/owner-1");
  });

  it("allows producers to preview approved published assets", async () => {
    const getDoc = vi.fn(async (path: string) =>
      path === "contentAssets/asset-published"
        ? { ownerUid: "producer-3", status: "PUBLISHED", masterPlaylistUrl: "/private/asset-published/master.m3u8" }
        : null,
    );
    const grant = await createPrivatePreviewGrant(
      { getDoc } as unknown as Firestore,
      { uid: "producer-3", email: "producer@example.com", emailVerified: true },
      "asset",
      "asset-published",
    );
    expect(grant.previewPath).toContain("/content/asset-published?preview=true&previewToken=");
  });

  it("allows the account that uploaded an asset to preview it privately", async () => {
    const getDoc = vi.fn(async (path: string) =>
      path === "contentAssets/asset-2"
        ? { ownerUid: "producer-2", status: "ready", masterPlaylistUrl: "/private/asset-2/master.m3u8" }
        : null,
    );
    const grant = await createPrivatePreviewGrant(
      { getDoc } as unknown as Firestore,
      { uid: "producer-2", email: "producer@example.com", emailVerified: true },
      "asset",
      "asset-2",
    );
    expect(grant.previewPath).toContain("/content/asset-2?preview=true&previewToken=");
    expect(grant.streamUrl).toBe("/private/asset-2/master.m3u8");
  });
});
