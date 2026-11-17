import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";
import { releaseStorageReservation } from "@/lib/server/storage/reservations";
import { videoWorkerRetry, isVideoWorkerLeaseActive } from "@/lib/server/video-worker-policy";
import { wakeModalVideoWorker } from "@/lib/server/modal-wake";

const schema = z.object({
  claimToken: z.string().regex(/^[a-f0-9]{32}$/),
  errorCode: z.string().regex(/^[A-Z0-9_]{1,80}$/),
});
export const Route = createFileRoute("/api/public/v1/worker/jobs/$assetId/fail")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const fs = await Firestore.create();
      const workerId = await requireVideoWorker(request, fs);
      const body = await parseBody(request, schema);
      const assetId = params.assetId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) throw new ApiError(400, "WORKER_JOB_INVALID", "The processing job identifier is invalid.");
      const path = "videoTranscodeJobs/" + assetId;
      const job = await fs.getDoc(path);
      if (!job || job["status"] !== "processing" || job["claimToken"] !== body.claimToken || job["workerId"] !== workerId ||
          !isVideoWorkerLeaseActive(job["leaseExpiresAt"])) {
        throw new ApiError(409, "WORKER_LEASE_INVALID", "The processing job lease is no longer valid.");
      }
      const attempts = typeof job["attempts"] === "number" ? job["attempts"] : 1;
      const retry = videoWorkerRetry(attempts);
      const terminal = retry.terminal;
      const reservationId = typeof job["outputReservationId"] === "string" ? job["outputReservationId"] : "";
      const abandonedPrefix = typeof job["outputPrefix"] === "string" ? job["outputPrefix"] : "";
      const destinationId = typeof job["outputDestinationId"] === "string" ? job["outputDestinationId"] : "";
      const attemptSequence = typeof job["attemptSequence"] === "number" ? job["attemptSequence"] : attempts;
      if (reservationId) await releaseStorageReservation(fs, reservationId);
      const now = new Date().toISOString();
      await fs.patchDoc(path, {
        status: terminal ? "failed" : "queued",
        workerStatus: terminal ? "failed" : "retry_waiting",
        nextAttemptAt: retry.nextAttemptAt,
        claimToken: null, leaseExpiresAt: null,
        outputDestinationId: null, outputPrefix: null, outputReservationId: null, outputReservedBytes: null,
        lastErrorCode: body.errorCode,
        lastFailedAt: now, updatedAt: now,
      });
      if (abandonedPrefix && destinationId) {
        const cleanupId = "cleanup_" + assetId + "_a" + attemptSequence;
        try {
          await fs.setDoc("videoMaintenanceJobs/" + cleanupId, {
            taskType: "delete_attempt_prefix",
            payload: { assetId, prefix: abandonedPrefix, destinationId },
            status: "queued",
            attempts: 0,
            createdAt: now,
            updatedAt: now,
          }, { mustNotExist: true });
        } catch {
          // An existing cleanup task is already responsible for this attempt folder.
        }
      }
      if (terminal) await fs.patchDoc("contentAssets/" + assetId, {
        status: "transcode_failed", transcodeJobStatus: "failed",
        transcodeErrorCode: body.errorCode, updatedAt: now,
      });
      await wakeModalVideoWorker();
      return Response.json({ assetId, status: terminal ? "failed" : "queued", attempts });
    } catch (error) { return errorBody(error); }
  } } },
});
