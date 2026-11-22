import { describe, it, expect } from "vitest";
import {
  generatePreviewToken,
  verifyPreviewToken,
  type PreviewGrantPayload,
} from "../lib/server/preview-grants";
import {
  validateExternalUrlSafe,
  runChannelPreflightTests,
} from "../lib/server/channel-auto-tests";
import { computeChannelChecklist } from "../lib/server/partner-checklist";
import {
  renderPartnerInvitationEmail,
  renderChannelSetUpEmail,
  renderAutoTestFailedEmail,
  renderMonthlyStatementReadyEmail,
} from "../lib/server/partner-emails";

describe("Rule N27: Cryptographic Private Previews & Unbilled Playback Guard", () => {
  const secret = "test-jwt-secret-key-for-preview-grants-1234567890";

  it("generates and verifies valid HMAC-SHA256 signed preview tokens", () => {
    const payload: PreviewGrantPayload = {
      targetType: "channel",
      targetId: "ch_test_123",
      granteeUid: "user_owner_1",
      role: "owner",
      exp: Math.floor(Date.now() / 1000) + 3600,
      isPreview: true,
    };

    const token = generatePreviewToken(payload, secret);
    expect(token).toMatch(/^prev_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const verified = verifyPreviewToken(token, secret);
    expect(verified.targetType).toBe("channel");
    expect(verified.targetId).toBe("ch_test_123");
    expect(verified.granteeUid).toBe("user_owner_1");
    expect(verified.role).toBe("owner");
    expect(verified.isPreview).toBe(true);
  });

  it("rejects preview token when signature is tampered", () => {
    const payload: PreviewGrantPayload = {
      targetType: "asset",
      targetId: "asset_test_999",
      granteeUid: "user_producer_1",
      role: "producer",
      exp: Math.floor(Date.now() / 1000) + 3600,
      isPreview: true,
    };

    const token = generatePreviewToken(payload, secret);
    const parts = token.slice("prev_".length).split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ targetType: "asset", targetId: "asset_test_999", exp: 9999999999, isPreview: true })
    ).toString("base64url");
    const tamperedToken = `prev_${tamperedPayload}.${parts[1]}`;

    expect(() => verifyPreviewToken(tamperedToken, secret)).toThrow(/Invalid preview token signature/);
  });

  it("rejects expired preview token", () => {
    const payload: PreviewGrantPayload = {
      targetType: "channel",
      targetId: "ch_test_123",
      granteeUid: "user_1",
      role: "owner",
      exp: Math.floor(Date.now() / 1000) - 10, // already expired
      isPreview: true,
    };

    const token = generatePreviewToken(payload, secret);
    expect(() => verifyPreviewToken(token, secret)).toThrow(/expired/i);
  });
});

describe("Rule N21: Channel Automated Test Suite & SSRF Protection", () => {
  it("detects and blocks SSRF / loopback / private IP targets in validateExternalUrlSafe", () => {
    expect(validateExternalUrlSafe("http://localhost:8080/live.m3u8").valid).toBe(false);
    expect(validateExternalUrlSafe("http://127.0.0.1:8000/stream").valid).toBe(false);
    expect(validateExternalUrlSafe("http://192.168.1.1/video.mp4").valid).toBe(false);
    expect(validateExternalUrlSafe("http://10.0.0.1/video.mp4").valid).toBe(false);
    expect(validateExternalUrlSafe("http://172.16.0.1/video.mp4").valid).toBe(false);
    expect(validateExternalUrlSafe("http://169.254.169.254/latest/meta-data/").valid).toBe(false);
    expect(validateExternalUrlSafe("https://169.254.169.254/").valid).toBe(false);
    expect(validateExternalUrlSafe("ftp://example.com/stream").valid).toBe(false);
    expect(validateExternalUrlSafe("not-a-url").valid).toBe(false);
    expect(validateExternalUrlSafe("https://stream.example.com/hls/live.m3u8").valid).toBe(true);
  });

  it("returns failing preflight on missing stream url", () => {
    const report = runChannelPreflightTests({ streamUrl: "" });
    expect(report.passed).toBe(false);
    const streamItem = report.results.find((r) => r.checkId === "stream_reachability");
    expect(streamItem?.passed).toBe(false);
  });

  it("returns failing preflight on invalid or blocked stream url", () => {
    const report = runChannelPreflightTests({ streamUrl: "http://127.0.0.1:9000/live.m3u8" });
    expect(report.passed).toBe(false);
    const streamItem = report.results.find((r) => r.checkId === "stream_reachability");
    expect(streamItem?.passed).toBe(false);
  });
});

describe("Rule N21: Partner Launch Readiness Checklist", () => {
  it("blocks go-live when required policies or artwork are missing", () => {
    const checklist = computeChannelChecklist({
      id: "ch_1",
      name: "Test Partner TV",
    });

    expect(checklist.canGoLive).toBe(false);
    expect(checklist.overallStatus).toBe("Action Required");
    const privacyItem = checklist.items.find((i) => i.key === "privacy_link");
    expect(privacyItem?.status).toBe("Needs attention");
    const termsItem = checklist.items.find((i) => i.key === "terms_link");
    expect(termsItem?.status).toBe("Needs attention");
  });

  it("allows go-live only when all items are approved and tests pass", () => {
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
    const checklist = computeChannelChecklist({
      id: "ch_1",
      name: "Test Partner TV",
      description: "A full channel description for broadcast.",
      contactEmail: "legal@example.com",
      ageRating: "PG",
      partnerPrivacyUrl: "https://example.com/privacy",
      partnerPrivacyApproved: true,
      partnerTermsUrl: "https://example.com/terms",
      partnerTermsApproved: true,
      licenceStartDate: new Date().toISOString(),
      licenceEndDate: futureDate,
      rightsVerified: true,
      licenceApproved: true,
      streamUrl: "https://stream.example.com/live.m3u8",
      streamApproved: true,
      logoUrl: "https://example.com/logo.png",
      bannerUrl: "https://example.com/banner.jpg",
    });

    expect(checklist.items.every((i) => i.status === "Done")).toBe(true);
    expect(checklist.canGoLive).toBe(true);
    expect(checklist.overallStatus).toBe("Ready to Go Live");
  });

  it("disallows go-live if items are still waiting for review", () => {
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
    const checklist = computeChannelChecklist({
      id: "ch_1",
      name: "Test Partner TV",
      description: "A full channel description for broadcast.",
      contactEmail: "legal@example.com",
      ageRating: "PG",
      partnerPrivacyUrl: "https://example.com/privacy",
      partnerPrivacyApproved: false, // Not yet approved
      partnerTermsUrl: "https://example.com/terms",
      partnerTermsApproved: true,
      licenceStartDate: new Date().toISOString(),
      licenceEndDate: futureDate,
      rightsVerified: true,
      licenceApproved: true,
      streamUrl: "https://stream.example.com/live.m3u8",
      streamApproved: true,
      logoUrl: "https://example.com/logo.png",
      bannerUrl: "https://example.com/banner.jpg",
    });

    expect(checklist.canGoLive).toBe(false);
    expect(checklist.overallStatus).toBe("Review in Progress");
  });
});

describe("Rule N22: Partner Email Templates & Communication", () => {
  it("renders partner invitation with correct support contact", () => {
    const email = renderPartnerInvitationEmail({
      inviterName: "Sarah Connor",
      channelName: "Acme Sports 1",
      role: "Broadcast Operator",
    });

    expect(email.subject).toContain("Acme Sports 1");
    expect(email.body).toContain("Sarah Connor");
    expect(email.body).toContain("tv@bqsqwad.com");
  });

  it("renders channel setup email with channel details", () => {
    const email = renderChannelSetUpEmail({
      partnerName: "Acme Media",
      channelName: "Acme Cinema",
      slug: "acme-cinema",
    });

    expect(email.subject).toContain("Acme Cinema");
    expect(email.body).toContain("Acme Media");
    expect(email.body).toContain("tv@bqsqwad.com");
  });

  it("renders test failure alert with itemized issues", () => {
    const email = renderAutoTestFailedEmail({
      partnerName: "Acme Media",
      channelName: "Live Feed Beta",
      failureSummary: "Stream unreachable: HTTP 502",
      fixSteps: "Check encoder output URL",
      referenceId: "ref_12345",
    });

    expect(email.subject).toContain("Live Feed Beta");
    expect(email.body).toContain("HTTP 502");
    expect(email.body).toContain("ref_12345");
    expect(email.body).toContain("tv@bqsqwad.com");
  });

  it("renders monthly partner statement email with totals", () => {
    const email = renderMonthlyStatementReadyEmail({
      partnerName: "Apex Media",
      statementPeriod: "October 2026",
      totalEarningsFormatted: "$8,750.00",
    });

    expect(email.subject).toContain("October 2026");
    expect(email.body).toContain("$8,750.00");
    expect(email.body).toContain("tv@bqsqwad.com");
  });
});
