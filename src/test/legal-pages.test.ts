import { describe, expect, it } from "vitest";
import { defaultPages as pages } from "../lib/legal/default-pages";
import { findUnfilledLegalPlaceholders } from "../lib/server/legal-acceptance";

describe("default legal page drafts", () => {
  it("contains all five required unique audiences and slugs", () => {
    expect(pages.map(page => page.slug).sort()).toEqual([
      "privacy-policy", "producer-policy", "producer-terms", "provider-terms", "terms",
    ]);
    expect(new Set(pages.map(page => page.slug)).size).toBe(5);
  });

  it("keeps all seed pages as reviewable Markdown drafts with required placeholders", () => {
    for (const page of pages) {
      expect(page.body.startsWith("# ")).toBe(true);
      expect(page.body).toContain("{{effective_date}}");
      expect(page.body).toContain("{{last_updated}}");
      expect(page.body).not.toMatch(/<\/?script/i);
    }
    expect(pages.find(page => page.slug === "privacy-policy")?.audience).toBe("public");
    expect(pages.find(page => page.slug === "producer-terms")?.audience).toBe("producer");
    expect(pages.find(page => page.slug === "provider-terms")?.audience).toBe("provider");
    expect(pages.find(page => page.slug === "provider-terms")?.body.toLowerCase()).toContain("gross profit");
  });

  it("detects every unfilled placeholder and allows completed copy", () => {
    expect(findUnfilledLegalPlaceholders("{{effective_date}} and {{minimum_age}}")).toEqual(["effective_date", "minimum_age"]);
    expect(findUnfilledLegalPlaceholders("Effective date: 2026-11-17")).toEqual([]);
  });

  it("never seeds a published document", () => {
    expect(pages.every(page => !("status" in page))).toBe(true);
  });
});
