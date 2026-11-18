import { ApiError, type Firestore } from "./firebase-admin";
import { defaultPages } from "../legal/default-pages";

export type LegalAudience = "public" | "producer" | "provider";

export function findUnfilledLegalPlaceholders(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{([a-z0-9_]+)\}\}/g)].map((match) => match[1] ?? ""))].filter(Boolean).sort();
}

const REQUIRED_BY_AUDIENCE: Record<LegalAudience, string[]> = {
  public: ["terms", "privacy-policy"],
  producer: ["terms", "privacy-policy", "producer-terms", "producer-policy"],
  provider: ["terms", "privacy-policy", "provider-terms"],
};

export async function getRequiredLegalPages(fs: Firestore, audience: LegalAudience) {
  const slugs = REQUIRED_BY_AUDIENCE[audience];
  const pages = await Promise.all(slugs.map((slug) => fs.getDoc("sitePages/" + slug)));

  return pages.map((page, index) => {
    const slug = slugs[index]!;
    // If Firestore has a published document without placeholders, use it
    if (
      page &&
      page["status"] === "published" &&
      typeof page["body"] === "string" &&
      !/\{\{[a-z0-9_]+\}\}/.test(page["body"]) &&
      Number.isSafeInteger(page["version"])
    ) {
      return {
        slug,
        version: page["version"] as number,
        title: String(page["title"] ?? slug),
        requiresReacceptance: page["requiresReacceptance"] === true,
      };
    }

    // Otherwise, fall back to bundled default as version 0
    const bundled = defaultPages.find((p: { slug: string }) => p.slug === slug);
    return {
      slug,
      version: 0,
      title: bundled?.title ?? slug,
      requiresReacceptance: false,
    };
  });
}

export async function assertLegalAcceptance(fs: Firestore, uid: string, audience: LegalAudience = "public"): Promise<void> {
  const pages = await getRequiredLegalPages(fs, audience);
  for (const page of pages) {
    const exact = await fs.getDoc("legalAcceptances/" + uid + "_" + page.slug + "_v" + page.version);
    let accepted = exact;
    if (!accepted && !page.requiresReacceptance) {
      for (let version = page.version - 1; version >= 0; version -= 1) {
        accepted = await fs.getDoc("legalAcceptances/" + uid + "_" + page.slug + "_v" + version);
        if (accepted) break;
      }
    }
    if (
      !accepted ||
      accepted["uid"] !== uid ||
      accepted["slug"] !== page.slug ||
      !Number.isSafeInteger(accepted["version"]) ||
      (page.requiresReacceptance && accepted["version"] !== page.version)
    ) {
      throw new ApiError(
        403,
        "LEGAL_ACCEPTANCE_REQUIRED",
        "Please review and accept the current service terms and privacy notice before continuing."
      );
    }
  }
}
