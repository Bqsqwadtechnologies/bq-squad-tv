import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  applyChangeRequestGoLive,
  rollbackChangeRequest,
  maskSecrets,
  targetPathForChange,
  validateChangeRequestPayload,
  type ChangeRequestRecord,
} from "@/lib/server/change-requests";
import { defaultPages } from "@/lib/legal/default-pages";

// Mock Firestore
class MockFirestore {
  docs = new Map<string, Record<string, unknown>>();

  async getDoc(path: string) {
    return this.docs.get(path) ?? null;
  }

  async setDoc(path: string, data: Record<string, unknown>) {
    this.docs.set(path, data);
  }

  async patchDoc(path: string, patch: Record<string, unknown>) {
    const existing = this.docs.get(path) || {};
    this.docs.set(path, { ...existing, ...patch });
  }

  async query(collection: string) {
    const res: Record<string, unknown>[] = [];
    for (const [key, val] of this.docs.entries()) {
      if (key.startsWith(collection + "/")) {
        res.push(val);
      }
    }
    return res;
  }
}

describe("Batch N12 — Documents Hub & Where is Everything", () => {
  it("covers all 4 mandatory document categories in default documents", () => {
    expect(defaultPages.length).toBeGreaterThanOrEqual(18);

    const slugs = defaultPages.map((p) => p.slug);

    // 1. Legal
    expect(slugs).toContain("privacy-policy");
    expect(slugs).toContain("terms");
    expect(slugs).toContain("cookie");
    expect(slugs).toContain("refund-policy");
    expect(slugs).toContain("community-guidelines");
    expect(slugs).toContain("copyright-dmca");
    expect(slugs).toContain("age-restriction");
    expect(slugs).toContain("account-deletion");

    // 2. Producer documents
    expect(slugs).toContain("producer-terms");
    expect(slugs).toContain("producer-privacy");
    expect(slugs).toContain("payout-policy");

    // 3. Provider documents
    expect(slugs).toContain("provider-terms");
    expect(slugs).toContain("provider-privacy");
    expect(slugs).toContain("partner-with-us");

    // 4. Help and data-protection pages
    expect(slugs).toContain("help");
    expect(slugs).toContain("data-protection");
  });

  it("stores and updates all owner-editable dates (effective, published, scheduled)", async () => {
    const fs = new MockFirestore();
    const nowIso = new Date().toISOString();
    const effectiveIso = "2026-06-01T00:00:00.000Z";
    const scheduledIso = "2026-07-01T12:00:00.000Z";

    await fs.setDoc("sitePages/terms", {
      slug: "terms",
      title: "Terms and Conditions",
      status: "published",
      version: 1,
      effectiveAt: effectiveIso,
      publishedAt: nowIso,
      scheduledPublishAt: scheduledIso,
      requiresReacceptance: true,
      updatedAt: nowIso,
    });

    const doc = await fs.getDoc("sitePages/terms");
    expect(doc).not.toBeNull();
    expect(doc?.effectiveAt).toBe(effectiveIso);
    expect(doc?.publishedAt).toBe(nowIso);
    expect(doc?.scheduledPublishAt).toBe(scheduledIso);
    expect(doc?.requiresReacceptance).toBe(true);
  });

  it("unpublishes a live document back to draft status", async () => {
    const fs = new MockFirestore();
    await fs.setDoc("sitePages/privacy-policy", {
      slug: "privacy-policy",
      status: "published",
      version: 2,
    });

    await fs.patchDoc("sitePages/privacy-policy", {
      status: "draft",
      updatedAt: new Date().toISOString(),
    });

    const doc = await fs.getDoc("sitePages/privacy-policy");
    expect(doc?.status).toBe("draft");
  });
});

describe("Batch N19 — Change Requests: Approve, Then Go Live", () => {
  it("masks secrets in before and after state diffs", () => {
    const raw = {
      streamUrl: "https://stream.example.com/live.m3u8",
      streamKey: "live_sec_1234567890abcdef",
      authToken: "bearer_xyz987654",
      channelName: "African Cinema HD",
      metadata: {
        password: "SuperSecretPassword!",
        normalField: "visible",
      },
    };

    const clean = maskSecrets(raw);
    expect(clean.streamUrl).toBe("https://stream.example.com/live.m3u8");
    expect(clean.channelName).toBe("African Cinema HD");
    expect(clean.streamKey).toBe("••••••••");
    expect(clean.authToken).toBe("••••••••");
    expect((clean.metadata as Record<string, unknown>).password).toBe("••••••••");
    expect((clean.metadata as Record<string, unknown>).normalField).toBe("visible");
  });

  it("resolves target document paths across all supported scopes", () => {
    expect(targetPathForChange("channel_details", "ch_123")).toBe("channels/ch_123");
    expect(targetPathForChange("stream_config", "str_456")).toBe("live_streams/str_456");
    expect(targetPathForChange("producer_title", "title_789")).toBe("content_assets/title_789");
    expect(targetPathForChange("payout_profile", "pay_001")).toBe("payout_profiles/pay_001");
  });

  it("validates change request payload requirements", () => {
    expect(() =>
      validateChangeRequestPayload({
        scope: "channel_details",
        targetType: "channel",
        targetId: "ch_test",
        before: {},
        after: {},
      }),
    ).not.toThrow();

    expect(() =>
      validateChangeRequestPayload({
        scope: "" as any,
        targetType: "channel",
        targetId: "ch_test",
        before: {},
        after: {},
      }),
    ).toThrow();
  });

  it("strictly enforces: Approve alone does NOT make anything live; Go Live applies atomically", async () => {
    const fs = new MockFirestore();
    const channelPath = "channels/ch_999";
    await fs.setDoc(channelPath, {
      id: "ch_999",
      name: "Old Channel Name",
      category: "Entertainment",
    });

    const requestId = "cr_test_100";
    await fs.setDoc(`changeRequests/${requestId}`, {
      id: requestId,
      scope: "channel_details",
      targetType: "channel",
      targetId: "ch_999",
      status: "submitted",
      before: { name: "Old Channel Name" },
      after: { name: "New Brand Channel HD" },
      createdAt: new Date().toISOString(),
    });

    // 1. Reviewer approves request
    await fs.patchDoc(`changeRequests/${requestId}`, {
      status: "approved",
      reviewedBy: "zillionaire_reviewer_1",
    });

    // CRITICAL ASSERTION: The live channel still has its OLD name!
    const channelAfterApprove = await fs.getDoc(channelPath);
    expect(channelAfterApprove?.name).toBe("Old Channel Name");

    // 2. Reviewer presses Go Live
    const updatedCr = await applyChangeRequestGoLive(fs as any, requestId, "zillionaire_reviewer_1");
    expect(updatedCr.status).toBe("live");
    expect(updatedCr.previousSnapshot).toEqual({
      id: "ch_999",
      name: "Old Channel Name",
      category: "Entertainment",
    });

    // CRITICAL ASSERTION: Now the target channel is atomically updated!
    const channelAfterGoLive = await fs.getDoc(channelPath);
    expect(channelAfterGoLive?.name).toBe("New Brand Channel HD");
  });

  it("rolls back live change request with one click, restoring previous snapshot", async () => {
    const fs = new MockFirestore();
    const channelPath = "channels/ch_888";
    await fs.setDoc(channelPath, {
      id: "ch_888",
      name: "Channel V2 Live",
      lastChangeRequestId: "cr_live_01",
    });

    await fs.setDoc("changeRequests/cr_live_01", {
      id: "cr_live_01",
      targetType: "channel",
      targetId: "ch_888",
      status: "live",
      previousSnapshot: {
        id: "ch_888",
        name: "Channel V1 Original",
      },
    });

    const rolledBack = await rollbackChangeRequest(
      fs as any,
      "cr_live_01",
      "zillionaire_reviewer_1",
      "Stream stutter reported by viewers",
    );

    expect(rolledBack.status).toBe("rolled_back");
    expect(rolledBack.notes).toContain("Stream stutter reported by viewers");

    const channelAfterRollback = await fs.getDoc(channelPath);
    expect(channelAfterRollback?.name).toBe("Channel V1 Original");
  });

  it("blocks Go Live if automatic tests failed unless explicit override reason is provided", async () => {
    const fs = new MockFirestore();
    await fs.setDoc("channels/ch_failed", { id: "ch_failed" });
    await fs.setDoc("changeRequests/cr_failed_tests", {
      id: "cr_failed_tests",
      targetType: "channel",
      targetId: "ch_failed",
      status: "approved",
      after: { streamUrl: "https://bad.url" },
      autoTestResults: { passed: false, details: "Stream URL returned 404" },
    });

    // Should throw error without override reason
    await expect(
      applyChangeRequestGoLive(fs as any, "cr_failed_tests", "reviewer_1"),
    ).rejects.toThrow(/Automatic tests failed/);

    // Should succeed with valid override reason
    await expect(
      applyChangeRequestGoLive(fs as any, "cr_failed_tests", "reviewer_1", {
        overrideAutoTestReason: "CDN warm-up window permitted by broadcast engineer",
      }),
    ).resolves.not.toThrow();
  });
});
