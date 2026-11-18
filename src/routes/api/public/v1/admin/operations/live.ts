import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/admin/operations/live")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const access = await requireAdminModule(fs, user, "system");
          

          const sessions = await fs.query("sessions");
          const active = sessions.filter((s: Record<string, unknown>) => s["active"] === true);

          const liveViewersByChannel: Record<string, number> = {};
          for (const s of active) {
            const ch = (s["channelId"] as string) ?? "vod";
            liveViewersByChannel[ch] = (liveViewersByChannel[ch] ?? 0) + 1;
          }

          return Response.json({
            totalActiveViewers: active.length,
            viewersByChannel: liveViewersByChannel,
            waitingRoomQueueLength: 0,
            storageHealth: "healthy",
            transcodeWorkersActive: 2,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
