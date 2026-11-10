import { createFileRoute } from "@tanstack/react-router";
import { Firestore, type QueryFilter } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, requireUser } from "@/lib/server/api";
import { toChannelSummary, visibleChannels } from "./-shared";

export const Route = createFileRoute("/api/public/v1/catalog/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const url = new URL(request.url);
          const queryText = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
          const category = url.searchParams.get("category")?.slice(0, 60);
          const language = url.searchParams.get("language")?.slice(0, 60);

          const fs = await Firestore.create();
          const profile = await getUserProfile(fs, user.uid);
          const filters: QueryFilter[] = [{ field: "published", op: "EQUAL", value: true }];
          if (category) filters.push({ field: "category", op: "EQUAL", value: category });
          if (language) filters.push({ field: "language", op: "EQUAL", value: language });

          let results = visibleChannels(await fs.query("channels", { filters, limit: 200 }), profile.adultEligible);
          if (queryText) {
            results = results.filter((channel) =>
              (typeof channel["title"] === "string" ? (channel["title"] as string) : "").toLowerCase().includes(queryText),
            );
          }
          // Adult filtering happens before any result is returned.
          return Response.json({ results: results.map(toChannelSummary) });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
