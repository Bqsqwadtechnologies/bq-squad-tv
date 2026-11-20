import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

describe("Batch 4: Public Copyright Reporting & Moderation Cases", () => {
  const root = resolve(__dirname, "../..");

  it("provides the public /copyright-report page with required fields and affirmations", () => {
    const filePath = resolve(root, "src/routes/copyright-report.tsx");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");

    // Route definition
    expect(content).toContain('createFileRoute("/copyright-report")');

    // Required fields: reporter name, email, organisation
    expect(content).toContain("reporterName");
    expect(content).toContain("reporterEmail");
    expect(content).toContain("reporterOrganization");

    // Work claimed and proof link
    expect(content).toContain("workClaimed");
    expect(content).toContain("proofLinkOrPath");

    // Good faith and accuracy statements + electronic signature
    expect(content).toContain("goodFaithStatement");
    expect(content).toContain("accuracyStatement");
    expect(content).toContain("signature");

    // Anti-spam honeypot
    expect(content).toContain("honeypot");
  });

  it("integrates Report this video action on content.$assetId.tsx (actions bar and player overlay)", () => {
    const filePath = resolve(root, "src/routes/content.$assetId.tsx");
    const content = readFileSync(filePath, "utf-8");

    // Action button label
    expect(content).toContain("Report this video");

    // Player overlay controls button
    expect(content).toContain('title="Report this video"');

    // Form fields in video page report modal
    expect(content).toContain("reporterOrganization");
    expect(content).toContain("workClaimed");
    expect(content).toContain("proofLinkOrPath");
    expect(content).toContain("goodFaithStatement");
    expect(content).toContain("signature");
  });

  it("integrates Report channel action on channels.$channelId.tsx", () => {
    const filePath = resolve(root, "src/routes/channels.$channelId.tsx");
    const content = readFileSync(filePath, "utf-8");

    expect(content).toContain("/copyright-report?channelId=");
    expect(content).toContain("Report channel");
  });

  it("handles copyright reports in content-reports API with case creation, under-review state, and producer notification", () => {
    const filePath = resolve(root, "src/routes/api/public/v1/content-reports/index.ts");
    const content = readFileSync(filePath, "utf-8");

    // Schema validations
    expect(content).toContain("reporterOrganization");
    expect(content).toContain("workClaimed");
    expect(content).toContain("proofLinkOrPath");
    expect(content).toContain("goodFaithStatement");
    expect(content).toContain("signature");

    // Anti-spam honeypot handling
    expect(content).toContain("website_url");
    expect(content).toContain("spam-filtered");

    // Case creation in copyrightCases/
    expect(content).toContain("copyrightCases/");
    expect(content).toContain("under_review");
    expect(content).toContain("counterNoticeDeadline");

    // Producer notification enqueueing
    expect(content).toContain("users/${ownerUid}/notifications");
    expect(content).toContain("Copyright Claim Received");
  });

  it("provides Zillionaire copyright cases API with remove, keep, restore decisions and repeat strikes", () => {
    const filePath = resolve(root, "src/routes/api/public/v1/zillionaire/copyright-cases/index.ts");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");

    // Access control
    expect(content).toContain('requireZillionaireModule(fs, user, "moderation")');
    expect(content).toContain('requireZillionaireModule(fs, user, "content")');

    // Decisions
    expect(content).toContain('"remove"');
    expect(content).toContain('"keep"');
    expect(content).toContain('"restore"');

    // Repeat-infringer strikes increment on removal
    expect(content).toContain("copyrightStrikes");
    expect(content).toContain("takedown");

    // Timeline and audit logging
    expect(content).toContain("timeline");
    expect(content).toContain("writeAuditLog");
  });

  it("surfaces Copyright Cases tab in Zillionaire Moderation console with timeline and decisions", () => {
    const filePath = resolve(root, "src/routes/zillionaire.moderation.tsx");
    const content = readFileSync(filePath, "utf-8");

    // Tab definition
    expect(content).toContain('{ key: "copyright", label: "Copyright Cases", icon: ShieldAlert }');

    // Stats and case list
    expect(content).toContain("Copyright Cases & DMCA Notices");
    expect(content).toContain("copyrightCases");
    expect(content).toContain("copyrightStrikes");
    expect(content).toContain("counterNoticeDeadline");

    // Timeline modal and action controls
    expect(content).toContain("Case Details & Timeline");
    expect(content).toContain("handleCopyrightDecision");
  });
});
