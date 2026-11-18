import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/recommendations/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const allTitles = await fs.query("contentAssets", { limit: 20 });
          const items = allTitles
            .filter((t: Record<string, unknown>) => t["status"] === "published")
            .map((t: Record<string, unknown>) => ({
              id: t["__id"],
              title: t["title"],
              category: t["category"] ?? "general",
              score: 0.95,
            }));

          return Response.json({
            items,
            recommendationType: "top_picks_for_you",
            userId: user.uid,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
