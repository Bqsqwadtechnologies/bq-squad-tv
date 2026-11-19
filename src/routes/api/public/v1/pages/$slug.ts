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
  "producer-policy": "producer-policy",
  "producer-content-policy": "producer-policy",
  "provider-terms": "provider-terms",
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
};

const CONFIG_PLACEHOLDERS: Record<string, string> = {
  effective_date: "January 1, 2026",
  last_updated: "April 2026",
  company_name: "BQ Sqwad Technologies",
  platform_name: "BQ SQWAD TV",
  contact_email: "tv@bqsqwad.com",
  support_email: "tv@bqsqwad.com",
  legal_email: "tv@bqsqwad.com",
  minimum_age: "13",
  governing_law: "the laws of the Federal Republic of Nigeria",
  dispute_resolution_forum: "Lagos, Nigeria",
  data_retention_period: "7 years for billing logs and 90 days for diagnostic data",
};

function fillPlaceholders(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, key) => {
    const normalized = key.toLowerCase().replace(/-/g, "_");
    return CONFIG_PLACEHOLDERS[normalized] ?? match;
  });
}

export const Route = createFileRoute("/api/public/v1/pages/")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const rawSlug = params.slug.toLowerCase();
          const slug = SLUG_ALIASES[rawSlug] ?? rawSlug;

          if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
            throw new ApiError(404, "PAGE_NOT_FOUND", "This page is not available.");
          }

          // Try loading published page from Firestore
          try {
            const fs = await Firestore.create();
            const page = await fs.getDoc("sitePages/" + slug);
            if (page && page["status"] === "published" && typeof page["body"] === "string") {
              return Response.json(
                {
                  slug,
                  title: page["title"],
                  body: fillPlaceholders(page["body"]),
                  version: page["version"] ?? 1,
                  effectiveAt: page["effectiveAt"] ?? new Date().toISOString(),
                  audience: page["audience"] ?? "public",
                },
                { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } }
              );
            }
          } catch {
            // Firestore error or page missing: fall back to bundled default
          }

          // Fall back to bundled default
          const bundled = defaultPages.find(
            (p: { slug: string }) => p.slug === slug || SLUG_ALIASES[p.slug] === slug
          );

          if (bundled) {
            return Response.json(
              {
                slug,
                title: bundled.title,
                body: fillPlaceholders(bundled.body),
                version: 0,
                effectiveAt: (bundled as Record<string, unknown>)["effectiveAt"] ?? "2026-01-01T00:00:00.000Z",
                audience: bundled.audience ?? "public",
              },
              { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } }
            );
          }

          throw new ApiError(404, "PAGE_NOT_FOUND", "This page is not available.");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
