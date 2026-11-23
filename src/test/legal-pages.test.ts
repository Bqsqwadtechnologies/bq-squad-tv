import { describe, expect, it } from "vitest";
import { defaultPages as pages } from "../lib/legal/default-pages";
import { findUnfilledLegalPlaceholders } from "../lib/server/legal-acceptance";

const REQUIRED_SLUGS = [
  "about",
  "account-deletion",
  "age-restriction",
  "bq-sqwad-originals",
  "community-guidelines",
  "contact",
  "cookie",
  "copyright-dmca",
  "data-protection",
  "help",
  "partner-with-us",
  "payout-policy",
  "privacy-policy",
  "producer-policy",
  "producer-privacy",
  "producer-terms",
  "provider-privacy",
  "provider-terms",
  "refund-policy",
  "terms",
];

const LINKED_FOOTER_AND_NAV_SLUGS = [
  "privacy-policy",
  "terms",
  "cookie",
  "contact",
  "help",
  "about",
  "refund-policy",
  "community-guidelines",
  "copyright-dmca",
];

describe("default legal page drafts", () => {
  it("contains all required unique audiences and slugs", () => {
    const presentSlugs = pages.map((p) => p.slug).sort();
    expect(presentSlugs).toEqual(REQUIRED_SLUGS);
    expect(new Set(presentSlugs).size).toBe(20);
  });

  it("keeps seed pages as reviewable Markdown drafts without script tags", () => {
    for (const page of pages) {
      expect(page.body.startsWith("# ")).toBe(true);
      expect(page.body).not.toMatch(/<\/?script/i);
    }
    expect(pages.find((page) => page.slug === "privacy-policy")?.audience).toBe("public");
    expect(pages.find((page) => page.slug === "cookie")?.audience).toBe("public");
    expect(pages.find((page) => page.slug === "producer-terms")?.audience).toBe("producer");
    expect(pages.find((page) => page.slug === "provider-terms")?.audience).toBe("provider");
    expect(pages.find((page) => page.slug === "provider-privacy")?.audience).toBe("provider");
  });

  it("every linked footer, account, and Android slug resolves to an available bundled page", () => {
    const availableSlugs = new Set(pages.map((p) => p.slug));
    for (const slug of LINKED_FOOTER_AND_NAV_SLUGS) {
      expect(availableSlugs.has(slug)).toBe(true);
    }
  });

  it("detects every unfilled placeholder and allows completed copy", () => {
    expect(findUnfilledLegalPlaceholders("{{effective_date}} and {{minimum_age}}")).toEqual([
      "effective_date",
      "minimum_age",
    ]);
    expect(findUnfilledLegalPlaceholders("Effective date: 2026-11-17")).toEqual([]);
  });

  it("never seeds a published document", () => {
    expect(pages.every((page) => !("status" in page))).toBe(true);
  });
});
