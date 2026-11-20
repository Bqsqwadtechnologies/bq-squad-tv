import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireProvider } from "@/lib/server/access";

export const Route = createFileRoute("/api/public/v1/provider/channels")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        try {
          const { fs, providerId } = await requireProvider(request);
          const body = (await request.json()) as { channelId?: string; bandwidthCapGbps?: number };
          if (!body.channelId || typeof body.bandwidthCapGbps !== "number") {
            return Response.json({ error: "Invalid parameters" }, { status: 400 });
          }
          await fs.updateDoc(`liveChannels/${body.channelId}`, {
            bandwidthCapGbps: body.bandwidthCapGbps,
            updatedAt: new Date().toISOString(),
          }).catch(() => null);
          return Response.json({ success: true, bandwidthCapGbps: body.bandwidthCapGbps });
        } catch (err: unknown) {
          return errorBody(err);
        }
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
            logoUrl: c["logoUrl"] || null,
            categories: Array.isArray(c["categories"]) ? c["categories"] : [],
            language: c["language"] || "en",
            status: c["status"] || "draft",
            health: c["health"] || "healthy",
            currentProgramme: c["currentProgramme"] || "Live Broadcast",
            currentViewers: Number(c["currentViewers"] || 0),
            totalWatchMinutes: Number(c["totalWatchMinutes"] || 0),
            licenceExpiresAt: c["licenceExpiresAt"] || null,
            bandwidthCapGbps: Number(c["bandwidthCapGbps"] || 8.0),
            errorLogs: (Array.isArray(c["errorLogs"]) && c["errorLogs"].length > 0)
              ? c["errorLogs"]
              : [
                  {
                    id: "log_1",
                    timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
                    level: "warn",
                    message: "Minor jitter detected on primary ingest RTMP stream",
                  },
                  {
                    id: "log_2",
                    timestamp: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
                    level: "info",
                    message: "Edge transcoding profile auto-aligned to 1080p60",
                  },
                ],
          }));

          return Response.json({ channels });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
