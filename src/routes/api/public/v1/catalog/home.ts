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
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
