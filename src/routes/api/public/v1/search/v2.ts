import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/search/v2")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
          const category = url.searchParams.get("category");
          const fs = await Firestore.create();

          if (!q && !category) {
            return Response.json({ titles: [], channels: [], totalResults: 0 });
          }

          const allTitles = await fs.query("contentAssets", { limit: 100 });
          const allChannels = await fs.query("channels", { limit: 50 });

          const titles = allTitles.filter((t: Record<string, unknown>) => {
            const titleMatch = String(t["title"] ?? "").toLowerCase().includes(q);
            const catMatch = !category || t["category"] === category;
            return (titleMatch || !q) && catMatch && t["status"] === "published";
          });

          const channels = allChannels.filter((c: Record<string, unknown>) => {
            const nameMatch = String(c["name"] ?? "").toLowerCase().includes(q);
            return (nameMatch || !q) && c["status"] === "published";
          });

          return Response.json({
            query: q,
            titles: titles.map((t: Record<string, unknown>) => ({
              id: t.__id,
              title: t["title"],
              category: t["category"],
            })),
            channels: channels.map((c: Record<string, unknown>) => ({
              id: c.__id,
              name: c["name"],
            })),
            totalResults: titles.length + channels.length,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
