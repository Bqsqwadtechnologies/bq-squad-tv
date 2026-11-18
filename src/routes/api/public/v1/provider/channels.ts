import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireProvider } from "@/lib/server/access";

export const Route = createFileRoute("/api/public/v1/provider/channels")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const { fs, providerId } = await requireProvider(request);

        const providerChannels = await fs.query("liveChannels", {
          filters: [{ field: "providerId", op: "EQUAL", value: providerId }],
          limit: 100,
        });

        const channels = providerChannels.map(c => ({
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
        }));

        return Response.json({ channels });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
  }},
});
