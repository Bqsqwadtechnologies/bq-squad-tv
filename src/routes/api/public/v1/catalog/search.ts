import { createFileRoute } from "@tanstack/react-router";
import { Firestore, type QueryFilter } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, requireUser } from "@/lib/server/api";
import { toChannelSummary, visibleChannels } from "./-shared";

export const Route = createFileRoute("/api/public/v1/catalog/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const queryText = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
          const category = url.searchParams.get("category")?.slice(0, 60);
          const language = url.searchParams.get("language")?.slice(0, 60);

          const fs = await Firestore.create();

          // Check if request has authenticated user; if signed out, default to safe mode (adultEligible = false)
          let adultEligible = false;
          const auth = request.headers.get("authorization");
          if (auth && auth.startsWith("Bearer ")) {
            try {
              const user = await requireUser(request);
              const profile = await getUserProfile(fs, user.uid);
              adultEligible = profile.adultEligible;
            } catch {
              adultEligible = false;
            }
          }

          const filters: QueryFilter[] = [{ field: "published", op: "EQUAL", value: true }];
          if (category) filters.push({ field: "category", op: "EQUAL", value: category });
          if (language) filters.push({ field: "language", op: "EQUAL", value: language });

          let results = visibleChannels(
            await fs.query("channels", { filters, limit: 200 }),
            adultEligible,
          );
          if (queryText) {
            results = results.filter((channel) =>
              (typeof channel["title"] === "string" ? (channel["title"] as string) : "")
                .toLowerCase()
                .includes(queryText),
            );
          }
          // Adult filtering happens before any result is returned.
          const summaries = results.map(toChannelSummary);
          return Response.json({ results: summaries, channels: summaries });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
