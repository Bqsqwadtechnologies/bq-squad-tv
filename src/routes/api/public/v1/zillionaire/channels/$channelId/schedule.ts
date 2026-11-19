import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";
import { channelScheduleSchema, saveChannelSchedule } from "@/lib/server/channel-schedule";

export const Route = createFileRoute("/api/public/v1/zillionaire/channels/$channelId/schedule")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const channelId = params.channelId;
          if (!/^[A-Za-z0-9_-]{1,80}$/.test(channelId))
            throw new ApiError(400, "CHANNEL_ID_INVALID", "The channel id is invalid.");
          const body = await parseBody(request, channelScheduleSchema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "channels");
          await enforceRateLimit(fs, "admin-schedule-write:" + user.uid, {
            limit: 60,
            windowMs: 60_000,
          });
          const result = await saveChannelSchedule(fs, channelId, user.uid, body);
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: result.created ? "channel.schedule_created" : "channel.schedule_updated",
            targetType: "channelSchedule",
            targetId: result.programmeId,
            reason: body.reason ?? "Channel schedule updated",
            metadata: { channelId, startsAt: body.startsAt, endsAt: body.endsAt },
          });
          return Response.json({ ...result, channelId }, { status: result.created ? 201 : 200 });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
