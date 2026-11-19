import { describe, expect, it } from "vitest";
import {
  assertLegalAcceptance,
  findUnfilledLegalPlaceholders,
  getRequiredLegalPages,
  type LegalAudience,
} from "../lib/server/legal-acceptance";
import type { Firestore } from "../lib/server/firebase-admin";

function fakeFirestore(records: Record<string, Record<string, unknown>>) {
  return {
    getDoc: async (path: string) => records[path] ?? null,
  } as unknown as Firestore;
}

function published(slug: string, audience: string, version = 2, requiresReacceptance = true) {
  return {
    slug,
    audience,
    status: "published",
    version,
    title: slug,
    body: "# Published page\n\nReviewed text.",
    requiresReacceptance,
  };
}

function legalRecords(audience: LegalAudience, requiresReacceptance = true) {
  const records: Record<string, Record<string, unknown>> = {};
  const common = ["terms", "privacy-policy"];
  const specific =
    audience === "producer"
      ? ["producer-terms", "producer-policy"]
      : audience === "provider"
        ? ["provider-terms"]
        : [];
  for (const slug of [...common, ...specific]) {
    const pageAudience = common.includes(slug) ? "public" : audience;
    records["sitePages/" + slug] = published(slug, pageAudience, 2, requiresReacceptance);
  }
  return records;
}

describe("legal acceptance enforcement", () => {
  it("requires only the public documents for viewers", async () => {
    const pages = await getRequiredLegalPages(fakeFirestore(legalRecords("public")), "public");
    expect(pages.map((page) => page.slug).sort()).toEqual(["privacy-policy", "terms"]);
  });

  it("requires the producer terms and content policy for producers", async () => {
    const pages = await getRequiredLegalPages(fakeFirestore(legalRecords("producer")), "producer");
    expect(pages.map((page) => page.slug).sort()).toEqual([
      "privacy-policy",
      "producer-policy",
      "producer-terms",
      "terms",
    ]);
  });

  it("requires provider terms in addition to public terms for providers", async () => {
    const pages = await getRequiredLegalPages(fakeFirestore(legalRecords("provider")), "provider");
    expect(pages.map((page) => page.slug).sort()).toEqual([
      "privacy-policy",
      "provider-terms",
      "terms",
    ]);
  });

  it("rejects a page published for the wrong audience", async () => {
    const records = legalRecords("provider");
    records["sitePages/provider-terms"] = published("provider-terms", "producer");
    await expect(getRequiredLegalPages(fakeFirestore(records), "provider")).rejects.toMatchObject({
      code: "LEGAL_PAGES_NOT_READY",
    });
  });

  it("blocks use when a required page is missing or still a draft", async () => {
    const records = legalRecords("public");
    records["sitePages/terms"] = { ...published("terms", "public"), status: "draft" };
    await expect(getRequiredLegalPages(fakeFirestore(records), "public")).rejects.toMatchObject({
      code: "LEGAL_PAGES_NOT_READY",
    });
  });

  it("blocks incomplete published text", async () => {
    const records = legalRecords("public");
    records["sitePages/privacy-policy"] = {
      ...published("privacy-policy", "public"),
      body: "Text {{minimum_age}}",
    };
    await expect(getRequiredLegalPages(fakeFirestore(records), "public")).rejects.toMatchObject({
      code: "LEGAL_PAGE_INCOMPLETE",
    });
  });

  it("requires current-version acceptance when reacceptance is enabled", async () => {
    const records = legalRecords("public", true);
    records["legalAcceptances/viewer_terms_v1"] = {
      uid: "viewer",
      slug: "terms",
      version: 1,
    };
    await expect(assertLegalAcceptance(fakeFirestore(records), "viewer")).rejects.toMatchObject({
      code: "LEGAL_ACCEPTANCE_REQUIRED",
    });
  });

  it("honours earlier acceptance only when reacceptance is not required", async () => {
    const records = legalRecords("public", false);
    for (const slug of ["terms", "privacy-policy"]) {
      records["legalAcceptances/viewer_" + slug + "_v1"] = {
        uid: "viewer",
        slug,
        version: 1,
      };
    }
    await expect(assertLegalAcceptance(fakeFirestore(records), "viewer")).resolves.toBeUndefined();
  });

  it("accepts the exact current versions", async () => {
    const records = legalRecords("public", true);
    for (const slug of ["terms", "privacy-policy"]) {
      records["legalAcceptances/viewer_" + slug + "_v2"] = {
        uid: "viewer",
        slug,
        version: 2,
      };
    }
    await expect(assertLegalAcceptance(fakeFirestore(records), "viewer")).resolves.toBeUndefined();
  });

  it("lists every unique unfilled placeholder", () => {
    expect(
      findUnfilledLegalPlaceholders("{{minimum_age}} {{effective_date}} {{minimum_age}}"),
    ).toEqual(["effective_date", "minimum_age"]);
    expect(findUnfilledLegalPlaceholders("Effective date: 2026-11-17")).toEqual([]);
  });
});
