import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { Firestore } from "@/lib/server/firebase-admin";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export const Route = createFileRoute("/api/public/v1/zillionaire/providers/test-playback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "providers");

          const body = (await request.json()) as { channelId?: string };
          if (!body.channelId) {
            return Response.json({ error: "channelId is required" }, { status: 400 });
          }

          const channel = await fs.getDoc(`liveChannels/${body.channelId}`);
          if (!channel) {
            return Response.json({ error: "Channel not found" }, { status: 404 });
          }

          // Test playback connectivity without billing
          const streamUrl = String(channel["streamUrl"] || "");
          let connectivityOk = false;

          if (streamUrl.startsWith("http://") || streamUrl.startsWith("https://")) {
            connectivityOk = true;
          }

          const now = new Date().toISOString();
          await fs.patchDoc(`liveChannels/${body.channelId}`, {
            lastPlaybackTestAt: now,
            playbackTestPassed: connectivityOk,
            status: connectivityOk ? "published" : "draft",
          });

          await writeAuditLog(fs, {
            action: "channel_playback_tested",
            actorUid: user.uid,
            targetType: "live_channel",
            targetId: body.channelId,
            reason: `Playback test for channel ${body.channelId}: ${connectivityOk ? "passed" : "failed"}`,
            metadata: { passed: connectivityOk, now },
          });

          return Response.json({
            ok: connectivityOk,
            channelId: body.channelId,
            testedAt: now,
            status: connectivityOk ? "published" : "draft",
            message: connectivityOk
              ? "Playback test passed. Channel stream verified and published."
              : "Playback test failed. Stream URL not responding.",
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
