import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Batch B6 — Data Protection & Trust Page and Trust Notices", () => {
  const root = path.resolve(__dirname, "../..");

  it("help.data-protection route exists and has all 7 mandatory sections with in-page anchor IDs", () => {
    const filePath = path.join(root, "src/routes/help.data-protection.tsx");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf8");

    // Check 7 sections
    expect(content).toContain('id="what-we-collect"');
    expect(content).toContain('id="how-we-protect"');
    expect(content).toContain('id="identity-verification"');
    expect(content).toContain('id="payment-details"');
    expect(content).toContain('id="retention"');
    expect(content).toContain('id="your-rights"');
    expect(content).toContain('id="contact"');

    // Check contact email
    expect(content).toContain("tv@bqsqwad.com");

    // Check plain language and no overpromising words
    expect(content.toLowerCase()).not.toContain("unhackable");
    expect(content.toLowerCase()).not.toContain("100% secure");
  });

  it("sitemap.xml includes /help/data-protection", () => {
    const sitemapPath = path.join(root, "src/routes/sitemap.xml.ts");
    const content = fs.readFileSync(sitemapPath, "utf8");
    expect(content).toContain("/help/data-protection");
  });

  it("root layout footer includes data protection and trust link", () => {
    const rootPath = path.join(root, "src/routes/__root.tsx");
    const content = fs.readFileSync(rootPath, "utf8");
    expect(content).toContain('/help/data-protection');
    expect(content).toContain("Data protection & trust");
  });

  it("camera capture and payout screens display exact calm trust wording and link", () => {
    const cameraPath = path.join(root, "src/components/kyc/KycCameraCapture.tsx");
    const cameraContent = fs.readFileSync(cameraPath, "utf8");
    expect(cameraContent).toContain(
      "Your information is encrypted and protected. We use it only to verify your identity and to pay you."
    );
    expect(cameraContent).toContain("/help/data-protection");

    const payoutPath = path.join(root, "src/components/payouts/PayoutAccountForm.tsx");
    const payoutContent = fs.readFileSync(payoutPath, "utf8");
    expect(payoutContent).toContain(
      "Your information is encrypted and protected. We use it only to verify your identity and to pay you."
    );
    expect(payoutContent).toContain("/help/data-protection");

    const producerPath = path.join(root, "src/components/ProducerKycFlow.tsx");
    const producerContent = fs.readFileSync(producerPath, "utf8");
    expect(producerContent).toContain(
      "Your information is encrypted and protected. We use it only to verify your identity and to pay you."
    );
    expect(producerContent).toContain("/help/data-protection");
  });
});
