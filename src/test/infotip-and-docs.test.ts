import { describe, it, expect } from "vitest";
import tipsData from "../../content/help/tips.json";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";

describe("InfoTip & Help Registry", () => {
  it("loads tips registry with required schema properties", () => {
    expect(Object.keys(tipsData).length).toBeGreaterThan(0);

    for (const [key, tip] of Object.entries(tipsData)) {
      expect(key).toBeTruthy();
      expect(tip.title).toBeTruthy();
      expect(tip.description).toBeTruthy();
      expect(tip.docsSlug).toBeTruthy();
      expect(tip.anchor).toBeTruthy();
      // Verify no forbidden terms in descriptions
      expect(tip.description.toLowerCase()).not.toContain("firebase");
      expect(tip.description.toLowerCase()).not.toContain("firestore");
      expect(tip.description.toLowerCase()).not.toContain("cloudflare");
    }
  });

  it("ensures each tip references an existing provider markdown doc", () => {
    const providerDocsDir = path.resolve(process.cwd(), "content/docs/provider");
    expect(existsSync(providerDocsDir)).toBe(true);

    const docFiles = readdirSync(providerDocsDir);
    expect(docFiles.length).toBeGreaterThan(0);

    for (const [, tip] of Object.entries(tipsData)) {
      const expectedDocFile = `${tip.docsSlug}.md`;
      expect(docFiles).toContain(expectedDocFile);
    }
  });

  it("ensures each tip references an existing producer markdown doc", () => {
    const producerDocsDir = path.resolve(process.cwd(), "content/docs/producer");
    expect(existsSync(producerDocsDir)).toBe(true);

    const docFiles = readdirSync(producerDocsDir);
    expect(docFiles.length).toBeGreaterThan(0);

    for (const [, tip] of Object.entries(tipsData)) {
      const expectedDocFile = `${tip.docsSlug}.md`;
      expect(docFiles).toContain(expectedDocFile);
    }
  });
});
