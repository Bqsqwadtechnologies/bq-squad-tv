import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireProvider } from "@/lib/server/access";

export const Route = createFileRoute("/api/public/v1/provider/channels")({
  server: {
    handlers: {
      POST: async () => {
        return Response.json(
          {
            error: "CHANNEL_CREATION_RESTRICTED",
            message: "Only we can create channels. Contact tv@bqsqwad.com.",
          },
          { status: 403, headers: { "cache-control": "no-store" } },
        );
      },
      GET: async ({ request }) => {
        try {
          const { fs, providerId } = await requireProvider(request);

          const providerChannels = await fs.query("liveChannels", {
            filters: [{ field: "providerId", op: "EQUAL", value: providerId }],
            limit: 100,
          });

          const channels = providerChannels.map((c) => ({
            id: c.__id || c["channelId"] || c["id"],
            name: c["name"] || "Live Channel",
            slug: c["slug"] || "",
            logoUrl: c["logoUrl"] || null,
            bannerUrl: c["bannerUrl"] || null,
            categories: Array.isArray(c["categories"]) ? c["categories"] : [],
            language: c["language"] || "en",
            status: c["status"] || "in_review",
            health: c["health"] || "healthy",
            currentProgramme: c["currentProgramme"] || "Broadcast Stream",
            currentViewers: Number(c["currentViewers"] || 0),
            totalWatchMinutes: Number(c["totalWatchMinutes"] || 0),
            licenceExpiresAt: c["licenceExpiresAt"] || null,
            bandwidthCapGbps: Number(c["bandwidthCapGbps"] || 8.0),
            streamType: c["streamType"] || "hls_pull",
            streamUrl: c["streamUrl"] || "",
            errorLogs:
              Array.isArray(c["errorLogs"]) && c["errorLogs"].length > 0
                ? c["errorLogs"]
                : [],
          }));

          return Response.json({ channels });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
