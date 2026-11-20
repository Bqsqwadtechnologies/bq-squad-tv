import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { defaultPages } from "@/lib/legal/default-pages";

const SLUG_ALIASES: Record<string, string> = {
  privacy: "privacy-policy",
  "privacy-policy": "privacy-policy",
  terms: "terms",
  "terms-and-conditions": "terms",
  "producer-terms": "producer-terms",
  "producer-privacy": "producer-privacy",
  "producer-privacy-policy": "producer-privacy",
  "producer-policy": "producer-policy",
  "producer-content-policy": "producer-policy",
  "provider-terms": "provider-terms",
  "provider-privacy": "provider-privacy",
  "provider-privacy-policy": "provider-privacy",
  cookie: "cookie",
  cookies: "cookie",
  about: "about",
  "about-us": "about",
  help: "help",
  support: "help",
  contact: "contact",
  "contact-us": "contact",
  refund: "refund-policy",
  "refund-policy": "refund-policy",
  community: "community-guidelines",
  "community-guidelines": "community-guidelines",
  copyright: "copyright-dmca",
  "copyright-dmca": "copyright-dmca",
  dmca: "copyright-dmca",
  takedown: "copyright-dmca",
};

const KNOWN_SLUGS = new Set([
  "privacy-policy",
  "terms",
  "producer-terms",
  "producer-privacy",
  "producer-policy",
  "provider-terms",
  "provider-privacy",
  "cookie",
  "about",
  "help",
  "contact",
  "refund-policy",
  "community-guidelines",
  "copyright-dmca",
]);

const CONFIG_PLACEHOLDERS: Record<string, string> = {
  effective_date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  last_updated: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  company_name: "BQ Sqwad Technologies",
  platform_name: "BQ SQWAD TV",
  contact_email: "tv@bqsqwad.com",
  support_email: "tv@bqsqwad.com",
  legal_email: "tv@bqsqwad.com",
  governing_country: "Nigeria",
};

function fillPlaceholders(raw: string, dynamicSettings?: Record<string, unknown>): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_match, key) => {
    const normalized = key.toLowerCase().replace(/-/g, "_");
    if (dynamicSettings && typeof dynamicSettings[normalized] === "string" && dynamicSettings[normalized].trim()) {
      return (dynamicSettings[normalized] as string).trim();
    }
    return CONFIG_PLACEHOLDERS[normalized] ?? "To be confirmed before publication";
  });
}

function hasUnresolvedPlaceholders(raw: string, dynamicSettings?: Record<string, unknown>): boolean {
  const matches = [...raw.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g)];
  return matches.some((match) => {
    const key = (match[1] || "").toLowerCase().replace(/-/g, "_");
    const configured = dynamicSettings?.[key];
    return !(typeof configured === "string" && configured.trim()) && !CONFIG_PLACEHOLDERS[key];
  });
}

function getFallbackContent(slug: string): { title: string; body: string } {
  const titles: Record<string, string> = {
    "privacy-policy": "Privacy Policy",
    terms: "Terms and Conditions",
    "producer-terms": "Producer Terms and Conditions",
    "producer-privacy": "Producer Privacy Notice",
    "producer-policy": "Producer Content Policy",
    "provider-terms": "Licensed Channel Provider Terms",
    "provider-privacy": "Provider Privacy Notice",
    cookie: "Cookie and Tracking Notice",
    about: "About BQ SQWAD TV",
    help: "Help & Support",
    contact: "Contact Us",
    "refund-policy": "Refund and Cancellation Policy",
    "community-guidelines": "Community Guidelines",
    "copyright-dmca": "Copyright & DMCA Policy",
  };
  const title = titles[slug] ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title,
    body: `# ${title}\n\nWelcome to **BQ SQWAD TV**. This official ${title.toLowerCase()} policy is actively maintained by **BQ Sqwad Technologies**.\n\nFor questions, support, or legal inquiries, contact tv@bqsqwad.com.`,
  };
}

export const Route = createFileRoute("/api/public/v1/pages/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const rawSlug = params.slug.toLowerCase();
          const slug = SLUG_ALIASES[rawSlug] ?? rawSlug;

          let dynamicSettings: Record<string, unknown> | undefined;

          // Try loading published or scheduled-ready page from Firestore
          try {
            const fs = await Firestore.create();
            const [page, settingsDoc] = await Promise.all([
              fs.getDoc("sitePages/" + slug),
              fs.getDoc("platformConfig/legalSettings").catch(() => null),
            ]);

            if (settingsDoc?.["values"] && typeof settingsDoc["values"] === "object") {
              dynamicSettings = settingsDoc["values"] as Record<string, unknown>;
            }

            const now = new Date().toISOString();
            const isPublished = page && page["status"] === "published";
            const isScheduledDue =
              page &&
              page["status"] === "scheduled" &&
              typeof page["scheduledPublishAt"] === "string" &&
              page["scheduledPublishAt"] <= now;

            if (
              (isPublished || isScheduledDue) &&
              typeof page["body"] === "string" &&
              !hasUnresolvedPlaceholders(page["body"], dynamicSettings)
            ) {
              return Response.json(
                {
                  slug,
                  title: page["title"],
                  body: fillPlaceholders(page["body"], dynamicSettings),
                  version: page["version"] ?? 1,
                  effectiveAt: page["effectiveAt"] ?? now,
                  audience: page["audience"] ?? "public",
                  status: "published",
                  published: true,
                },
                { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
              );
            }
          } catch {
            // Firestore error or missing doc: continue to fallbacks
          }

          // Fall back to bundled default
          const bundled = defaultPages.find(
            (p: { slug: string }) => p.slug === slug || SLUG_ALIASES[p.slug] === slug,
          );

          if (bundled) {
            return Response.json(
              {
                slug,
                title: bundled.title,
                body: fillPlaceholders(bundled.body, dynamicSettings),
                version: 0,
                effectiveAt: null,
                audience: bundled.audience ?? "public",
                status: "draft",
                published: false,
              },
              { headers: { "cache-control": "no-store" } },
            );
          }

          // Guarantee: Public route NEVER says "not available" for the listed slugs!
          if (KNOWN_SLUGS.has(slug)) {
            const fallback = getFallbackContent(slug);
            return Response.json(
              {
                slug,
                title: fallback.title,
                body: fallback.body,
                version: 0,
                effectiveAt: null,
                audience: "public",
                status: "draft",
                published: false,
              },
              { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
            );
          }

          throw new ApiError(404, "PAGE_NOT_FOUND", "Document not found.");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
