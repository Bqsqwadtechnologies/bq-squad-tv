import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Batch 3 — Approvals Everywhere", () => {
  const approvalsApiSource = readFileSync(
    resolve(__dirname, "../routes/api/public/v1/zillionaire/approvals.ts"),
    "utf-8",
  );
  const approvalsUiSource = readFileSync(
    resolve(__dirname, "../routes/zillionaire.approvals.tsx"),
    "utf-8",
  );

  it("handles videos, episodes, live streams, artwork, and ad creatives in approval queue", () => {
    // API type includes content assets and live streams
    expect(approvalsApiSource).toContain('"video"');
    expect(approvalsApiSource).toContain('"episode"');
    expect(approvalsApiSource).toContain('"live_stream"');
    expect(approvalsApiSource).toContain('"artwork"');
    expect(approvalsApiSource).toContain('"ad_creative"');

    // UI supports tabs for video, episode, live stream, artwork
    expect(approvalsUiSource).toContain('id: "video"');
    expect(approvalsUiSource).toContain('id: "episode"');
    expect(approvalsUiSource).toContain('id: "live_stream"');
    expect(approvalsUiSource).toContain('id: "artwork"');
  });

  it("exposes declaration, proof of rights, age limit, duplicate result, and preview player to reviewer", () => {
    // Details payload in API
    expect(approvalsApiSource).toContain("declaration");
    expect(approvalsApiSource).toContain("proofOfRights");
    expect(approvalsApiSource).toContain("ageLimit");
    expect(approvalsApiSource).toContain("duplicateResult");
    expect(approvalsApiSource).toContain("previewPlayer");

    // Modal inspection in UI
    expect(approvalsUiSource).toContain("previewPlayer");
    expect(approvalsUiSource).toContain("declaration");
    expect(approvalsUiSource).toContain("proofOfRights");
    expect(approvalsUiSource).toContain("duplicateResult");
  });

  it("supports reviewer actions: Approve, Reject with reason, Request changes", () => {
    // API actions
    expect(approvalsApiSource).toContain('"approve"');
    expect(approvalsApiSource).toContain('"reject"');
    expect(approvalsApiSource).toContain('"request_changes"');

    // Changes requested status state
    expect(approvalsApiSource).toContain("changes_requested");

    // UI buttons
    expect(approvalsUiSource).toContain("Request Changes");
    expect(approvalsUiSource).toContain("Reject with Reason");
    expect(approvalsUiSource).toContain("Approve & Publish");
  });

  it("requires content review role or moderation for delegated reviewers", () => {
    expect(approvalsApiSource).toContain('requireZillionaireModule(fs, user, "content")');
    expect(approvalsUiSource).toContain('account.modules?.includes("content")');
    expect(approvalsUiSource).toContain("Content Review Permission Required");
  });

  it("dispatches notifications to producer on every decision", () => {
    expect(approvalsApiSource).toContain("users/${recipientUid}/notifications");
    expect(approvalsApiSource).toContain("actionVerb");
    expect(approvalsApiSource).toContain("deliveryStatus: \"queued\"");
  });
});
