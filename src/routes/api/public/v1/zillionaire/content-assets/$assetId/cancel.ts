import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { releaseStorageReservation } from "@/lib/server/storage/reservations";
import { writeAuditLog } from "@/lib/server/audit";
import { wakeModalVideoWorker } from "@/lib/server/modal-wake";

const schema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();

export const Route = createFileRoute("/api/public/v1/zillionaire/content-assets/$assetId/cancel")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const assetId = params.assetId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId))
            throw new ApiError(400, "ASSET_ID_INVALID", "The asset id is invalid.");
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "content");
          const jobPath = "videoTranscodeJobs/" + assetId;
          const job = await fs.getDoc(jobPath);
          if (!job || !["queued", "processing"].includes(String(job["status"]))) {
            throw new ApiError(
              409,
              "JOB_NOT_CANCELLABLE",
              "This processing job can no longer be cancelled.",
            );
          }
          const reservationId =
            typeof job["outputReservationId"] === "string" ? job["outputReservationId"] : "";
          const prefix = typeof job["outputPrefix"] === "string" ? job["outputPrefix"] : "";
          const destinationId =
            typeof job["outputDestinationId"] === "string" ? job["outputDestinationId"] : "";
          if (reservationId) await releaseStorageReservation(fs, reservationId);
          const now = new Date().toISOString();
          await fs.patchDoc(jobPath, {
            status: "cancelled",
            workerStatus: "cancelled",
            claimToken: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            outputReservationId: null,
            outputReservedBytes: null,
            outputPrefix: null,
            outputDestinationId: null,
            cancelledAt: now,
            cancelledBy: user.uid,
            cancelReason: body.reason,
            updatedAt: now,
          });
          if (prefix && destinationId) {
            const attempt = typeof job["attemptSequence"] === "number" ? job["attemptSequence"] : 1;
            const cleanupId = "cleanup_" + assetId + "_a" + attempt;
            try {
              await fs.setDoc(
                "videoMaintenanceJobs/" + cleanupId,
                {
                  taskType: "delete_attempt_prefix",
                  payload: { assetId, prefix, destinationId },
                  status: "queued",
                  attempts: 0,
                  createdAt: now,
                  updatedAt: now,
                },
                { mustNotExist: true },
              );
            } catch {
              // A prior cleanup task already owns this attempt prefix.
            }
          }
          await fs.patchDoc("contentAssets/" + assetId, {
            status: "transcode_cancelled",
            transcodeJobStatus: "cancelled",
            updatedAt: now,
          });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "content.asset_processing_cancelled",
            targetType: "contentAsset",
            targetId: assetId,
            reason: body.reason,
          });
          await wakeModalVideoWorker();
          return Response.json({ assetId, status: "cancelled" });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
