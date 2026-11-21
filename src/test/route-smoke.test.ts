import { describe, it, expect, vi } from "vitest";

// Mock browser globals & firebase session
vi.mock("@/lib/firebase-web-auth", () => ({
  getActiveWebIdToken: vi.fn().mockResolvedValue("mock-token"),
  restoreWebSession: vi.fn().mockResolvedValue("mock-token"),
  getWebAccount: vi.fn().mockResolvedValue({ uid: "test-user", email: "user@example.com", emailVerified: true }),
  getWebAuthHeaders: vi.fn().mockResolvedValue({ authorization: "Bearer mock-token" }),
  signOutWeb: vi.fn().mockResolvedValue(undefined),
  signInWithEmailPassword: vi.fn().mockResolvedValue({ user: { uid: "test" } }),
  createAccountWithEmailPassword: vi.fn().mockResolvedValue({ user: { uid: "test" } }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  signInWithGoogleCredential: vi.fn().mockResolvedValue({ user: { uid: "test" } }),
}));

describe("Route Smoke Test (Module & Definition Integrity)", () => {
  it("imports and verifies route: routes/about.tsx", async () => {
    const mod = await import("@/routes/about");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/account-deletion.tsx", async () => {
    const mod = await import("@/routes/account-deletion");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/account.tsx", async () => {
    const mod = await import("@/routes/account");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/age-restriction.tsx", async () => {
    const mod = await import("@/routes/age-restriction");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/channels.$channelId.tsx", async () => {
    const mod = await import("@/routes/channels.$channelId");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/contact.tsx", async () => {
    const mod = await import("@/routes/contact");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/content.$assetId.tsx", async () => {
    const mod = await import("@/routes/content.$assetId");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/copyright-report.tsx", async () => {
    const mod = await import("@/routes/copyright-report");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/downloads.tsx", async () => {
    const mod = await import("@/routes/downloads");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/help.data-protection.tsx", async () => {
    const mod = await import("@/routes/help.data-protection");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/help.tsx", async () => {
    const mod = await import("@/routes/help");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/high-demand.tsx", async () => {
    const mod = await import("@/routes/high-demand");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/history.tsx", async () => {
    const mod = await import("@/routes/history");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/index.tsx", async () => {
    const mod = await import("@/routes/index");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/legal.$slug.tsx", async () => {
    const mod = await import("@/routes/legal.$slug");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/library.tsx", async () => {
    const mod = await import("@/routes/library");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/live-tv.tsx", async () => {
    const mod = await import("@/routes/live-tv");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/maintenance.tsx", async () => {
    const mod = await import("@/routes/maintenance");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/movies.tsx", async () => {
    const mod = await import("@/routes/movies");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/not-available.tsx", async () => {
    const mod = await import("@/routes/not-available");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/notifications.tsx", async () => {
    const mod = await import("@/routes/notifications");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/offline.tsx", async () => {
    const mod = await import("@/routes/offline");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/payment-and-payout-policy.tsx", async () => {
    const mod = await import("@/routes/payment-and-payout-policy");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/privacy.tsx", async () => {
    const mod = await import("@/routes/privacy");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/producer-privacy.tsx", async () => {
    const mod = await import("@/routes/producer-privacy");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/producer-terms.tsx", async () => {
    const mod = await import("@/routes/producer-terms");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/producer.channels.$channelId.team.tsx", async () => {
    const mod = await import("@/routes/producer.channels.$channelId.team");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/producer.channels.tsx", async () => {
    const mod = await import("@/routes/producer.channels");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/producer.collaborations.tsx", async () => {
    const mod = await import("@/routes/producer.collaborations");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/producer.docs.tsx", async () => {
    const mod = await import("@/routes/producer.docs");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/producer.index.tsx", async () => {
    const mod = await import("@/routes/producer.index");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/producer.team.tsx", async () => {
    const mod = await import("@/routes/producer.team");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/provider-privacy-policy.tsx", async () => {
    const mod = await import("@/routes/provider-privacy-policy");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/provider-privacy.tsx", async () => {
    const mod = await import("@/routes/provider-privacy");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/provider-terms.tsx", async () => {
    const mod = await import("@/routes/provider-terms");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/provider.channels.tsx", async () => {
    const mod = await import("@/routes/provider.channels");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/provider.contracts.tsx", async () => {
    const mod = await import("@/routes/provider.contracts");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/provider.disputes.tsx", async () => {
    const mod = await import("@/routes/provider.disputes");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/provider.docs.tsx", async () => {
    const mod = await import("@/routes/provider.docs");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/provider.index.tsx", async () => {
    const mod = await import("@/routes/provider.index");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/provider.statements.tsx", async () => {
    const mod = await import("@/routes/provider.statements");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/provider.team.tsx", async () => {
    const mod = await import("@/routes/provider.team");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/search.tsx", async () => {
    const mod = await import("@/routes/search");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/series.tsx", async () => {
    const mod = await import("@/routes/series");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/settings.tsx", async () => {
    const mod = await import("@/routes/settings");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/terms.tsx", async () => {
    const mod = await import("@/routes/terms");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/wallet.tsx", async () => {
    const mod = await import("@/routes/wallet");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/watch-party.$partyId.tsx", async () => {
    const mod = await import("@/routes/watch-party.$partyId");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.ads.tsx", async () => {
    const mod = await import("@/routes/zillionaire.ads");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.analytics.tsx", async () => {
    const mod = await import("@/routes/zillionaire.analytics");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.announcements.tsx", async () => {
    const mod = await import("@/routes/zillionaire.announcements");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.approvals.tsx", async () => {
    const mod = await import("@/routes/zillionaire.approvals");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.audit.tsx", async () => {
    const mod = await import("@/routes/zillionaire.audit");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.blocked-content.tsx", async () => {
    const mod = await import("@/routes/zillionaire.blocked-content");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.channels.tsx", async () => {
    const mod = await import("@/routes/zillionaire.channels");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.cleanup-sample.tsx", async () => {
    const mod = await import("@/routes/zillionaire.cleanup-sample");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.collaborations.tsx", async () => {
    const mod = await import("@/routes/zillionaire.collaborations");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.comments.tsx", async () => {
    const mod = await import("@/routes/zillionaire.comments");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.content-calendar.tsx", async () => {
    const mod = await import("@/routes/zillionaire.content-calendar");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.copyright-cases.tsx", async () => {
    const mod = await import("@/routes/zillionaire.copyright-cases");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.delivery.tsx", async () => {
    const mod = await import("@/routes/zillionaire.delivery");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.errors.tsx", async () => {
    const mod = await import("@/routes/zillionaire.errors");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.features.tsx", async () => {
    const mod = await import("@/routes/zillionaire.features");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.finance.tsx", async () => {
    const mod = await import("@/routes/zillionaire.finance");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.firebase-schema.tsx", async () => {
    const mod = await import("@/routes/zillionaire.firebase-schema");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.fraud-watch.tsx", async () => {
    const mod = await import("@/routes/zillionaire.fraud-watch");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.geo-rules.tsx", async () => {
    const mod = await import("@/routes/zillionaire.geo-rules");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.index.tsx", async () => {
    const mod = await import("@/routes/zillionaire.index");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.kyc.tsx", async () => {
    const mod = await import("@/routes/zillionaire.kyc");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.live-tv.tsx", async () => {
    const mod = await import("@/routes/zillionaire.live-tv");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.moderation-workload.tsx", async () => {
    const mod = await import("@/routes/zillionaire.moderation-workload");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.moderation.tsx", async () => {
    const mod = await import("@/routes/zillionaire.moderation");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.movies.tsx", async () => {
    const mod = await import("@/routes/zillionaire.movies");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.notifications.tsx", async () => {
    const mod = await import("@/routes/zillionaire.notifications");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.pages.tsx", async () => {
    const mod = await import("@/routes/zillionaire.pages");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.payments.tsx", async () => {
    const mod = await import("@/routes/zillionaire.payments");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.payouts.tsx", async () => {
    const mod = await import("@/routes/zillionaire.payouts");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.pricing.tsx", async () => {
    const mod = await import("@/routes/zillionaire.pricing");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.privacy-requests.tsx", async () => {
    const mod = await import("@/routes/zillionaire.privacy-requests");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.producers.tsx", async () => {
    const mod = await import("@/routes/zillionaire.producers");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.promotions.tsx", async () => {
    const mod = await import("@/routes/zillionaire.promotions");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.providers.tsx", async () => {
    const mod = await import("@/routes/zillionaire.providers");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.receipts.tsx", async () => {
    const mod = await import("@/routes/zillionaire.receipts");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.referrals.tsx", async () => {
    const mod = await import("@/routes/zillionaire.referrals");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.releases.tsx", async () => {
    const mod = await import("@/routes/zillionaire.releases");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.reports.tsx", async () => {
    const mod = await import("@/routes/zillionaire.reports");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.rights-review.tsx", async () => {
    const mod = await import("@/routes/zillionaire.rights-review");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.scheduled-reports.tsx", async () => {
    const mod = await import("@/routes/zillionaire.scheduled-reports");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.search-tuning.tsx", async () => {
    const mod = await import("@/routes/zillionaire.search-tuning");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.security.tsx", async () => {
    const mod = await import("@/routes/zillionaire.security");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.series.tsx", async () => {
    const mod = await import("@/routes/zillionaire.series");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.settings.tsx", async () => {
    const mod = await import("@/routes/zillionaire.settings");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.splits-audit.tsx", async () => {
    const mod = await import("@/routes/zillionaire.splits-audit");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.status-page.tsx", async () => {
    const mod = await import("@/routes/zillionaire.status-page");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.storage.tsx", async () => {
    const mod = await import("@/routes/zillionaire.storage");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.strikes-appeals.tsx", async () => {
    const mod = await import("@/routes/zillionaire.strikes-appeals");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.support-macros.tsx", async () => {
    const mod = await import("@/routes/zillionaire.support-macros");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.support.tsx", async () => {
    const mod = await import("@/routes/zillionaire.support");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.team.tsx", async () => {
    const mod = await import("@/routes/zillionaire.team");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.test-lab.tsx", async () => {
    const mod = await import("@/routes/zillionaire.test-lab");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.trending-rails.tsx", async () => {
    const mod = await import("@/routes/zillionaire.trending-rails");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.upload-studio.tsx", async () => {
    const mod = await import("@/routes/zillionaire.upload-studio");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.video-studio.tsx", async () => {
    const mod = await import("@/routes/zillionaire.video-studio");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.viewers.tsx", async () => {
    const mod = await import("@/routes/zillionaire.viewers");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
  it("imports and verifies route: routes/zillionaire.wallets.tsx", async () => {
    const mod = await import("@/routes/zillionaire.wallets");
    expect(mod.Route).toBeDefined();
    expect(typeof mod.Route).toBe("object");
  });
});
