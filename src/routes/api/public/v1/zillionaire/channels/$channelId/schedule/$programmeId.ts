import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";
import { deleteChannelSchedule } from "@/lib/server/channel-schedule";

export const Route = createFileRoute(
  "/api/public/v1/zillionaire/channels/$channelId/schedule/$programmeId",
)({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const { channelId, programmeId } = params;
          if (
            !/^[A-Za-z0-9_-]{1,80}$/.test(channelId) ||
            !/^[A-Za-z0-9_-]{1,100}$/.test(programmeId)
          ) {
            throw new ApiError(
              400,
              "SCHEDULE_ID_INVALID",
              "The channel or programme id is invalid.",
            );
          }
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "channels");
          await enforceRateLimit(fs, "admin-schedule-write:" + user.uid, {
            limit: 60,
            windowMs: 60_000,
          });
          await deleteChannelSchedule(fs, channelId, programmeId);
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "channel.schedule_deleted",
            targetType: "channelSchedule",
            targetId: programmeId,
            reason: "Administrator removed a channel schedule item",
            metadata: { channelId },
          });
          return Response.json({ programmeId, deleted: true });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
