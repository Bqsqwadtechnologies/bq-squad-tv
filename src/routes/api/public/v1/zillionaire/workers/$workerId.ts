import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z
  .object({
    disabled: z.boolean(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/zillionaire/workers/$workerId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const workerId = params.workerId;
          if (!/^[A-Za-z0-9_-]{1,64}$/.test(workerId))
            throw new ApiError(400, "WORKER_ID_INVALID", "The worker identifier is invalid.");
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "security");
          if (!access.isZillionaireOwner)
            throw new ApiError(
              403,
              "OWNER_ONLY",
              "This setting is only available in the Zillionaire dashboard.",
            );
          const configured = process.env["VIDEO_WORKER_KEYS_JSON"] ?? "";
          if (configured) {
            let keys: Record<string, unknown>;
            try {
              const value = JSON.parse(configured) as unknown;
              if (!value || typeof value !== "object" || Array.isArray(value))
                throw new Error("invalid");
              keys = value as Record<string, unknown>;
            } catch {
              throw new ApiError(
                503,
                "WORKER_KEYS_INVALID",
                "The processing worker settings are invalid.",
              );
            }
            if (typeof keys[workerId] !== "string")
              throw new ApiError(
                404,
                "WORKER_NOT_FOUND",
                "That processing worker is not configured.",
              );
          } else if (workerId !== "legacy-shared") {
            throw new ApiError(
              404,
              "WORKER_NOT_FOUND",
              "That processing worker is not configured.",
            );
          }
          const now = new Date().toISOString();
          await fs.setDoc("videoWorkerRegistry/" + workerId, {
            workerId,
            disabled: body.disabled,
            updatedAt: now,
            updatedBy: user.uid,
            reason: body.reason,
          });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: body.disabled ? "video.worker_disabled" : "video.worker_enabled",
            targetType: "videoWorker",
            targetId: workerId,
            reason: body.reason,
          });
          return Response.json({ workerId, disabled: body.disabled });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
