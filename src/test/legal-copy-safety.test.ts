import { describe, expect, it } from "vitest";
import { defaultPages } from "../lib/legal/default-pages";

describe("default legal copy safety", () => {
  it("uses first-person plural, never first-person singular, in the user's policies", () => {
    for (const page of defaultPages) {
      expect(page.body).not.toMatch(/\bI\b/);
    }
  });

  it("does not name vendors in legal copy", () => {
    for (const page of defaultPages) {
      expect(page.body).not.toMatch(/\b(?:Paystack|Google Play|Backblaze|Supabase|Lovable|Cloudflare|AWS|Stripe)\b/i);
    }
  });

  it("covers pay-as-you-go billing, age rules, privacy, refunds, licensing and provider terms", () => {
    const bySlug = new Map(defaultPages.map((page) => [page.slug, page.body.toLowerCase()]));
    expect(bySlug.get("terms")).toContain("per minute");
    expect(bySlug.get("terms")).toContain("adult-only");
    expect(bySlug.get("privacy-policy")).toContain("children");
    expect(bySlug.get("refund-policy")).toContain("wallet");
    expect(bySlug.get("copyright-dmca")).toContain("copyright");
    expect(bySlug.get("provider-terms")).toContain("termination");
    expect(bySlug.get("producer-terms")).toContain("revenue share");
  });
});
