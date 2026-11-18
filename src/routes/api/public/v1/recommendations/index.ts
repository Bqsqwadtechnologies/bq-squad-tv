import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/recommendations/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const country = url.searchParams.get("country") ?? "NG";
          const isKids = url.searchParams.get("isKids") === "true";

          const fs = await Firestore.create();
          const allTitles = await fs.listDocs("titles");
          const published = allTitles.filter((t) => {
            if (t["status"] !== "published") return false;
            if (isKids && (t["rating"] === "18+" || t["rating"] === "16+")) return false;
            return true;
          });

          // Sort by watch minutes / rating
          const sorted = [...published].sort((a, b) => {
            const scoreA = Number(a["watchMinutes"] ?? 0) + Number(a["bayesianRating"] ?? 0) * 100;
            const scoreB = Number(b["watchMinutes"] ?? 0) + Number(b["bayesianRating"] ?? 0) * 100;
            return scoreB - scoreA;
          });

          return Response.json({
            forYou: sorted.slice(0, 10),
            trending: sorted.slice(0, 8),
            popularInCountry: sorted.slice(0, 8),
            country,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
