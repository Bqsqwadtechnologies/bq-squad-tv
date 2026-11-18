import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireProviderAccess } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/provider/channels")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        const access = await requireProviderAccess(fs, user);
        const providerId = access.providerId;

        const allChannels = await fs.listCollection("liveChannels", { limit: 100 });
        const providerChannels = allChannels
          .filter(c => c["providerId"] === providerId)
          .map(c => ({
            id: c["id"] || c["channelId"],
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

        return Response.json({ channels: providerChannels });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
  }},
});
