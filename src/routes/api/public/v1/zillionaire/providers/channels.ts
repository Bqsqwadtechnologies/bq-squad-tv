import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { Firestore } from "@/lib/server/firebase-admin";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export const Route = createFileRoute("/api/public/v1/zillionaire/providers/channels")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "providers");

          const channels = await fs.query("liveChannels", { limit: 100 });
          return Response.json({
            channels: channels.map((c) => ({
              id: c.__id || c["id"] || c["channelId"],
              providerId: c["providerId"],
              name: c["name"],
              logoUrl: c["logoUrl"] || null,
              categories: Array.isArray(c["categories"]) ? c["categories"] : [],
              language: c["language"] || "en",
              status: c["status"] || "draft",
              health: c["health"] || "healthy",
              playbackType: c["playbackType"] || "hls_token",
              streamUrl: c["streamUrl"] || "",
              licenceExpiresAt: c["licenceExpiresAt"] || null,
              lastPlaybackTestAt: c["lastPlaybackTestAt"] || null,
              playbackTestPassed: Boolean(c["playbackTestPassed"]),
            })),
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "providers");

          const body = (await request.json()) as {
            providerId?: string;
            name?: string;
            logoUrl?: string;
            categories?: string[];
            language?: string;
            streamUrl?: string;
            licenceExpiresAt?: string;
          };

          if (!body.providerId?.trim() || !body.name?.trim() || !body.streamUrl?.trim()) {
            return Response.json(
              { error: "Provider ID, name, and stream URL are required" },
              { status: 400 },
            );
          }

          const channelId = `live_${Date.now()}`;
          const newChannel = {
            channelId,
            providerId: body.providerId.trim(),
            name: body.name.trim(),
            logoUrl: body.logoUrl || null,
            categories: body.categories || ["General"],
            language: body.language || "en",
            streamUrl: body.streamUrl.trim(),
            playbackType: "hls_token",
            status: "draft",
            health: "healthy",
            licenceExpiresAt: body.licenceExpiresAt || null,
            playbackTestPassed: false,
            createdAt: new Date().toISOString(),
            createdByUid: user.uid,
          };

          await fs.setDoc(`liveChannels/${channelId}`, newChannel);
          await writeAuditLog(fs, {
            action: "live_channel_created",
            actorUid: user.uid,
            targetType: "live_channel",
            targetId: channelId,
            reason: `Created channel: ${body.name}`,
            metadata: { name: body.name, providerId: body.providerId },
          });

          return Response.json({ ok: true, channel: newChannel }, { status: 201 });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
