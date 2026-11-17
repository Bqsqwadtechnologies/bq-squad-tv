import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, requireUser } from "@/lib/server/api";
import { toChannelSummary, visibleChannels } from "./-shared";

export const Route = createFileRoute("/api/public/v1/catalog/home")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const profile = await getUserProfile(fs, user.uid);
          const channels = visibleChannels(
            await fs.query("channels", { filters: [{ field: "published", op: "EQUAL", value: true }], limit: 200 }),
            profile.adultEligible,
          );
          const summaries = channels.map(toChannelSummary);
          const visibleChannelIds = new Set(channels.map(channel => channel.__id));
          const featuredAssets = await fs.query("contentAssets", {
            filters: [
              { field: "featured", op: "EQUAL", value: true },
              { field: "status", op: "EQUAL", value: "ready" },
              { field: "contentStatus", op: "EQUAL", value: "published" },
            ],
            orderByField: "featureRank",
            limit: 50,
          });
          const featuredContent = featuredAssets
            .filter(asset => typeof asset["channelId"] === "string" && visibleChannelIds.has(asset["channelId"] as string))
            .sort((left, right) => {
              const leftRank = typeof left["featureRank"] === "number" ? left["featureRank"] as number : 10_000;
              const rightRank = typeof right["featureRank"] === "number" ? right["featureRank"] as number : 10_000;
              return leftRank - rightRank;
            })
            .map(asset => {
              const channelId = asset["channelId"] as string;
              const channel = channels.find(item => item.__id === channelId);
              return {
                id: asset.__id,
                channelId,
                channelTitle: typeof channel?.["title"] === "string" ? channel["title"] : "Channel",
                title: typeof asset["title"] === "string" ? asset["title"] : "Untitled",
                category: typeof asset["category"] === "string" ? asset["category"] : "Movie",
                genre: typeof asset["genre"] === "string"
                  ? asset["genre"]
                  : Array.isArray(asset["genres"]) ? asset["genres"].filter((value): value is string => typeof value === "string").join(", ") : "",
                posterUrl: typeof asset["posterUrl"] === "string" ? asset["posterUrl"] : null,
                averageStars: typeof asset["averageStars"] === "number" ? asset["averageStars"] : 0,
                ratingCount: typeof asset["ratingCount"] === "number" ? asset["ratingCount"] : 0,
                featureRank: typeof asset["featureRank"] === "number" ? asset["featureRank"] : 10_000,
              };
            });
          const now = Date.now();
          const inTwoHours = now + 2 * 60 * 60 * 1000;
          return Response.json({
            liveNow: summaries.filter((channel) => channel.isLive),
            startingSoon: channels
              .filter((channel) => {
                const startsAt = typeof channel["nextProgrammeStartsAt"] === "string" ? Date.parse(channel["nextProgrammeStartsAt"] as string) : null;
                return startsAt !== null && startsAt > now && startsAt <= inTwoHours;
              })
              .map(toChannelSummary),
            channels: summaries,
            replays: channels.filter((channel) => channel["hasReplays"] === true).map(toChannelSummary),
            continueWatching: [],
            trending: summaries.slice(0, 10),
            featuredContent,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
