import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, requireAdultForContent, requireUser } from "@/lib/server/api";
import { toChannelSummary } from "../catalog/-shared";

export const Route = createFileRoute("/api/public/v1/channels/$channelId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          let user = null;
          try {
            user = await requireUser(request);
          } catch {
            // Public unauthenticated preview allowed for non-adult broadcast feeds
          }

          const channelParam = params.channelId.trim();
          if (!/^[A-Za-z0-9_-]{1,80}$/.test(channelParam)) {
            throw new ApiError(400, "INVALID_REQUEST", "Invalid channel identifier.");
          }
          const fs = await Firestore.create();

          // Resolve channel: first check slug index, then direct ID, then query
          let internalChannelId = channelParam;
          let channel = await fs.getDoc(`channels/${channelParam}`);

          if (!channel) {
            const slugDoc = await fs.getDoc(`channelSlugs/${channelParam.toLowerCase()}`);
            if (slugDoc && typeof slugDoc["channelId"] === "string") {
              internalChannelId = slugDoc["channelId"] as string;
              channel = await fs.getDoc(`channels/${internalChannelId}`);
            }
          }

          if (!channel) {
            const matches = await fs.query("channels", {
              filters: [{ field: "slug", op: "EQUAL", value: channelParam.toLowerCase() }],
              limit: 1,
            });
            if (matches.length > 0 && matches[0]) {
              channel = matches[0];
              internalChannelId = String(channel["__id"] || channel["id"] || "");
            }
          }

          if (!channel || channel["published"] !== true) {
            throw new ApiError(404, "CHANNEL_NOT_FOUND", "This channel does not exist.");
          }

          // Age, rights and publication checks run before any channel data is returned.
          if (channel["adultOnly"]) {
            if (!user) {
              throw new ApiError(
                401,
                "UNAUTHENTICATED",
                "Please sign in to verify your age for adult-only channels.",
              );
            }
            const profile = await getUserProfile(fs, user.uid);
            requireAdultForContent(profile, true);
          }

          const schedule = await fs.query(`channels/${internalChannelId}/schedule`, {
            orderByField: "startsAt",
            limit: 50,
          });
          const replays = await fs.query(`channels/${internalChannelId}/replays`, {
            orderByField: "createdAt",
            descending: true,
            limit: 20,
          });

          // Public channel representation strictly uses the slug, never internal CH- IDs.
          const publicSlug = (channel["slug"] as string) || internalChannelId;

          return Response.json({
            channel: toChannelSummary({ ...channel, __id: publicSlug }),
            schedule: schedule.map((programme) => ({
              id: programme.__id,
              title: typeof programme["title"] === "string" ? programme["title"] : "Programme",
              startsAt: typeof programme["startsAt"] === "string" ? programme["startsAt"] : "",
              endsAt: typeof programme["endsAt"] === "string" ? programme["endsAt"] : "",
              description:
                typeof programme["description"] === "string" ? programme["description"] : null,
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
