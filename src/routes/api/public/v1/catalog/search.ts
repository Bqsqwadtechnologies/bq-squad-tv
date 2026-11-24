import { createFileRoute } from "@tanstack/react-router";
import { Firestore, type QueryFilter } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, requireUser } from "@/lib/server/api";
import { toChannelSummary, visibleChannels } from "./-shared";
import { isAvailableInRegion } from "@/lib/server/region-availability";

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

          const viewerCountry = request.headers.get("cf-ipcountry")?.trim().toUpperCase() ?? "";
          let results = visibleChannels(
            await fs.query("channels", { filters, limit: 200 }),
            adultEligible,
          ).filter((channel) => isAvailableInRegion(channel["regionAvailability"], viewerCountry));
          if (queryText) {
            results = results.filter((channel) =>
              (typeof channel["title"] === "string" ? (channel["title"] as string) : "")
                .toLowerCase()
                .includes(queryText),
            );
          }
          const summaries = results.map(toChannelSummary);

          // Rule N10: Search by producer name returns the producer page
          let matchingProducers: Array<{
            slug: string;
            name: string;
            avatarUrl: string | null;
            verified: boolean;
            followerCount: number;
          }> = [];

          if (queryText) {
            const allProducers = await fs.query("producers", { limit: 100 });
            matchingProducers = allProducers
              .filter((p) => {
                const name = String(p["displayName"] || p["name"] || "").toLowerCase();
                const slug = String(p["slug"] || "").toLowerCase();
                const publicId = String(p["publicId"] || "").toLowerCase();
                return name.includes(queryText) || slug.includes(queryText) || publicId.includes(queryText);
              })
              .slice(0, 8)
              .map((p) => ({
                slug: (p["slug"] as string) || (p["publicId"] as string) || p.__id,
                name: (p["displayName"] as string) || (p["name"] as string) || "Producer",
                avatarUrl: (p["avatarUrl"] as string) || null,
                verified: p["verificationStatus"] === "APPROVED",
                followerCount: Math.max(0, Number(p["followerCount"]) || 0),
              }));
          }

          return Response.json({
            results: summaries,
            channels: summaries,
            producers: matchingProducers,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
