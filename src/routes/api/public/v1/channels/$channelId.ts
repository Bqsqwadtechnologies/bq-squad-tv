import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, requireAdultForContent, requireUser } from "@/lib/server/api";
import { toChannelSummary } from "../catalog/-shared";

export const Route = createFileRoute("/api/public/v1/channels/$channelId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const channelId = params.channelId;
          if (!/^[A-Za-z0-9_-]{1,80}$/.test(channelId)) {
            throw new ApiError(400, "INVALID_REQUEST", "Invalid channel id.");
          }
          const fs = await Firestore.create();
          const profile = await getUserProfile(fs, user.uid);
          const channel = await fs.getDoc(`channels/${channelId}`);
          if (!channel || channel["published"] !== true) {
            throw new ApiError(404, "CHANNEL_NOT_FOUND", "This channel does not exist.");
          }
          // Age, rights and publication checks run before any channel data is returned.
          requireAdultForContent(profile, channel["adultOnly"]);

          const schedule = await fs.query(`channels/${channelId}/schedule`, { orderByField: "startsAt", limit: 50 });
          const replays = await fs.query(`channels/${channelId}/replays`, { orderByField: "createdAt", descending: true, limit: 20 });

          return Response.json({
            channel: toChannelSummary({ ...channel, __id: channelId }),
            schedule: schedule.map((programme) => ({
              id: programme.__id,
              title: typeof programme["title"] === "string" ? programme["title"] : "Programme",
              startsAt: typeof programme["startsAt"] === "string" ? programme["startsAt"] : "",
              endsAt: typeof programme["endsAt"] === "string" ? programme["endsAt"] : "",
              description: typeof programme["description"] === "string" ? programme["description"] : null,
            })),
            replays: replays.map((replay) =>
              toChannelSummary({ ...replay, __id: replay.__id, category: "Replay", isLive: false }),
            ),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
