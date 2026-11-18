import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/search/v2")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
          const genre = (url.searchParams.get("genre") ?? "").trim().toLowerCase();
          const isKids = url.searchParams.get("isKids") === "true";

          const fs = await Firestore.create();

          // Search published titles and channels
          const allTitles = await fs.listDocs("titles");
          const allChannels = await fs.listDocs("channels");

          const matches: unknown[] = [];

          for (const item of [...allTitles, ...allChannels]) {
            if (item["status"] !== "published") continue;
            if (isKids && (item["rating"] === "18+" || item["rating"] === "16+")) continue;

            const title = String(item["title"] ?? "").toLowerCase();
            const desc = String(item["description"] ?? "").toLowerCase();
            const itemGenre = String(item["genre"] ?? "").toLowerCase();
            const cast = Array.isArray(item["cast"]) ? item["cast"].join(" ").toLowerCase() : "";

            const matchesText = !q || title.includes(q) || desc.includes(q) || cast.includes(q);
            const matchesGenre = !genre || itemGenre.includes(genre);

            if (matchesText && matchesGenre) {
              matches.push(item);
            }
          }

          // Return top 30 matches and search suggestions
          return Response.json({
            query: q,
            count: matches.length,
            items: matches.slice(0, 30),
            suggestions: matches.slice(0, 5).map((m: any) => m["title"]),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
