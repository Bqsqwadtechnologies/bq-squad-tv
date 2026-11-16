import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";
import { releaseStorageReservation } from "@/lib/server/storage/reservations";

const schema = z.object({
  claimToken: z.string().regex(/^[a-f0-9]{32}$/),
  errorCode: z.string().regex(/^[A-Z0-9_]{1,80}$/),
});
export const Route = createFileRoute("/api/public/v1/worker/jobs/$assetId/fail")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const fs = await Firestore.create();
      await requireVideoWorker(request, fs);
      const body = await parseBody(request, schema);
      const assetId = params.assetId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) throw new ApiError(400, "WORKER_JOB_INVALID", "The processing job identifier is invalid.");
      const path = "videoTranscodeJobs/" + assetId;
      const job = await fs.getDoc(path);
      if (!job || job["status"] !== "processing" || job["claimToken"] !== body.claimToken) {
        throw new ApiError(409, "WORKER_LEASE_INVALID", "The processing job lease is no longer valid.");
      }
      const attempts = typeof job["attempts"] === "number" ? job["attempts"] : 1;
      const terminal = attempts >= 5;
      const reservationId = typeof job["outputReservationId"] === "string" ? job["outputReservationId"] : "";
      if (reservationId) await releaseStorageReservation(fs, reservationId);
      const now = new Date().toISOString();
      await fs.patchDoc(path, {
        status: terminal ? "failed" : "queued",
        workerStatus: terminal ? "failed" : "retry_waiting",
        claimToken: null, leaseExpiresAt: null,
        outputDestinationId: null, outputPrefix: null, outputReservationId: null,
        outputReservedBytes: null, lastErrorCode: body.errorCode,
        lastFailedAt: now, updatedAt: now,
      });
      if (terminal) await fs.patchDoc("contentAssets/" + assetId, {
        status: "transcode_failed", transcodeJobStatus: "failed",
        transcodeErrorCode: body.errorCode, updatedAt: now,
      });
      return Response.json({ assetId, status: terminal ? "failed" : "queued", attempts });
    } catch (error) { return errorBody(error); }
  } } },
});
