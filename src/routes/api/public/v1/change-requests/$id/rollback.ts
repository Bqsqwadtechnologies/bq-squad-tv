import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { rollbackChangeRequest } from "@/lib/server/change-requests";

const rollbackSchema = z
  .object({
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/change-requests/$id/rollback")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, rollbackSchema);
          const fs = await Firestore.create();

          // Role guard: Moderation or Content module required
          try {
            await requireZillionaireModule(fs, user, "moderation");
          } catch {
            await requireZillionaireModule(fs, user, "content");
          }

          const id = params.id;
          const updated = await rollbackChangeRequest(fs, id, user.uid, body.reason);

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "change_request.rolled_back",
            targetType: updated.targetType,
            targetId: updated.targetId,
            reason: body.reason,
            after: { requestId: id, status: "rolled_back" },
          });

          return Response.json({
            success: true,
            changeRequest: updated,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
