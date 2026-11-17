import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/pages/$slug")({
  server: { handlers: { GET: async ({ params }) => {
    try {
      const slug = params.slug;
      if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new ApiError(404, "PAGE_NOT_FOUND", "This page is not available.");
      const fs = await Firestore.create();
      const page = await fs.getDoc("sitePages/" + slug);
      if (!page || page["status"] !== "published" || typeof page["body"] !== "string") {
        throw new ApiError(404, "PAGE_NOT_FOUND", "This page is not available.");
      }
      if (page["body"].match(/\\{\\{[a-z0-9_]+\\}\\}/)) throw new ApiError(503, "PAGE_REVIEW_REQUIRED", "This page is being reviewed and is not available yet.");
      return Response.json({
        slug, title: page["title"], body: page["body"], version: page["version"],
        effectiveAt: page["effectiveAt"], audience: page["audience"],
      }, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
    } catch (error) { return errorBody(error); }
  } } },
});
