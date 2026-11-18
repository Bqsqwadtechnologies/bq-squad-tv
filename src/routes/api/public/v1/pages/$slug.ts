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
  about: "about",
  help: "help",
  contact: "contact",
};

export const Route = createFileRoute("/api/public/v1/pages/$slug")({
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
            if (
              page &&
              page["status"] === "published" &&
              typeof page["body"] === "string" &&
              !page["body"].match(/\{\{[a-z0-9_]+\}\}/)
            ) {
              return Response.json(
                {
                  slug,
                  title: page["title"],
                  body: page["body"],
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
                body: bundled.body,
                version: 0,
                effectiveAt: bundled.effectiveAt ?? "2026-01-01T00:00:00.000Z",
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
