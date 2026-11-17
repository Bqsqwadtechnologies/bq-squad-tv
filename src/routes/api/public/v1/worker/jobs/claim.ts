import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";
import { reserveStorageDestination, releaseStorageReservation } from "@/lib/server/storage/reservations";
import { estimateReservedBytes } from "@/lib/server/storage/routing";
import { resolveStorageDestinationConfiguration, validateStorageDestinationMetadata } from "@/lib/server/storage/registry";
import { loadSourceStorageConfiguration, createStorageDownloadTarget } from "@/lib/server/storage/transfers";
import { videoWorkerLeaseExpiry, videoWorkerRetryIsDue } from "@/lib/server/video-worker-policy";
import { getModalSpendSnapshot } from "@/lib/server/modal-spend";
import { getPlatformFlags } from "@/lib/server/flags";

export const Route = createFileRoute("/api/public/v1/worker/jobs/claim")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const fs = await Firestore.create();
      const workerId = await requireVideoWorker(request, fs);
      const [spend, flags] = await Promise.all([getModalSpendSnapshot(fs), getPlatformFlags(fs)]);
      if (spend.pauseNewJobs) {
        return Response.json({ job: null, paused: true, reason: "MONTHLY_SPEND_LIMIT", spend });
      }
      const queued = await fs.query("videoTranscodeJobs", { filters: [{ field: "status", op: "EQUAL", value: "queued" }], orderByField: "createdAt", limit: 10 });
      const processing = await fs.query("videoTranscodeJobs", { filters: [{ field: "status", op: "EQUAL", value: "processing" }], limit: 500 });
      const now = new Date();
      const candidates = [
        ...queued.filter(row => videoWorkerRetryIsDue(row["nextAttemptAt"], now.getTime())),
        ...processing.filter(row => typeof row["leaseExpiresAt"] !== "string" || !Number.isFinite(Date.parse(row["leaseExpiresAt"])) || Date.parse(row["leaseExpiresAt"]) <= now.getTime()),
      ];
      for (const row of candidates) {
        const assetId = row.__id;
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) continue;
        const jobPath = "videoTranscodeJobs/" + assetId;
        const claimToken = crypto.randomUUID().replace(/-/g, "");
        const leaseMinutes = Number(process.env["VIDEO_WORKER_LEASE_MINUTES"] ?? "10");
        const leaseExpiresAt = videoWorkerLeaseExpiry(now.getTime(), leaseMinutes);
        const claimed = await fs.transact([jobPath], docs => {
          const job = docs[0];
          if (!job || !["queued", "processing"].includes(String(job["status"]))) return { result: false, writes: [] };
          if (job["status"] === "processing" && typeof job["leaseExpiresAt"] === "string" && Date.parse(job["leaseExpiresAt"]) > now.getTime()) return { result: false, writes: [] };
          return { result: true, writes: [{ update: { name: fs.docName(jobPath), fields: {
            status: { stringValue: "processing" }, workerStatus: { stringValue: "processing" },
            claimToken: { stringValue: claimToken }, leaseExpiresAt: { stringValue: leaseExpiresAt },
            workerId: { stringValue: workerId },
            attempts: { integerValue: String((typeof job["attempts"] === "number" ? job["attempts"] : 0) + 1) },
            attemptSequence: { integerValue: String((typeof job["attemptSequence"] === "number" ? job["attemptSequence"] : 0) + 1) },
            startedAt: { stringValue: now.toISOString() }, updatedAt: { stringValue: now.toISOString() },
          } }, updateMask: { fieldPaths: ["status", "workerStatus", "claimToken", "leaseExpiresAt", "attempts", "attemptSequence", "startedAt", "updatedAt", "workerId"] } }] };
        });
        if (!claimed) continue;
        if (row["status"] === "processing" && typeof row["outputPrefix"] === "string" &&
            typeof row["outputDestinationId"] === "string" && typeof row["attemptSequence"] === "number") {
          const cleanupId = "cleanup_" + assetId + "_a" + row["attemptSequence"];
          try {
            await fs.setDoc("videoMaintenanceJobs/" + cleanupId, {
              taskType: "delete_attempt_prefix",
              payload: { assetId, prefix: row["outputPrefix"], destinationId: row["outputDestinationId"] },
              status: "queued", attempts: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(),
            }, { mustNotExist: true });
          } catch {
            // An earlier recovery already scheduled cleanup for this attempt.
          }
        }
        let newReservationId = "";
        try {
          const job = await fs.getDoc(jobPath);
          const asset = await fs.getDoc("contentAssets/" + assetId);
          if (!job || !asset || asset["status"] !== "uploaded_pending_transcode" ||
              typeof job["sourceObjectKey"] !== "string" || typeof job["sourceSizeBytes"] !== "number") {
            throw new ApiError(409, "TRANSCODE_SOURCE_INVALID", "The queued source asset is not ready for processing.");
          }
          if (typeof job["outputReservationId"] === "string") {
            await releaseStorageReservation(fs, job["outputReservationId"]);
          }
          const sourceConfig = await loadSourceStorageConfiguration(fs, asset);
          const sourceTarget = await createStorageDownloadTarget(sourceConfig, job["sourceObjectKey"], 3600);
          const profile = job["transcodeProfile"] === "economy" || job["transcodeProfile"] === "high"
            ? job["transcodeProfile"] : "standard";
          const reservationFactor = profile === "economy" ? 2.0 : profile === "high" ? 3.5 : 2.5;
          const reservedBytes = estimateReservedBytes(job["sourceSizeBytes"], reservationFactor);
          const outputReservationId = "hls-" + assetId.slice(0, 50) + "-" + claimToken;
          newReservationId = outputReservationId;
          const outputReservation = await reserveStorageDestination(fs, {
            purpose: "hls_streaming", incomingBytes: reservedBytes,
            reservationId: outputReservationId, ttlMs: 24 * 60 * 60_000,
          });
          const rawDestination = await fs.getDoc("storageDestinations/" + outputReservation.destinationId);
          if (!rawDestination) throw new ApiError(503, "HLS_DESTINATION_MISSING", "The HLS storage destination is unavailable.");
          const metadata = validateStorageDestinationMetadata({ ...rawDestination, destinationId: outputReservation.destinationId });
          const outputConfig = resolveStorageDestinationConfiguration(metadata);
          if (outputConfig.configurationStatus !== "configured") throw new ApiError(503, "HLS_DESTINATION_MISCONFIGURED", "The HLS destination is not configured.");
          const attemptNumber = typeof job["attemptSequence"] === "number" ? job["attemptSequence"] : 1;
          const outputPrefix = "hls/" + assetId + "/a" + attemptNumber;
          await fs.patchDoc(jobPath, {
            outputDestinationId: outputReservation.destinationId, outputPrefix,
            outputReservationId, outputReservedBytes: reservedBytes, attemptNumber,
            sourceDownloadExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
            updatedAt: new Date().toISOString(),
          });
          return Response.json({ job: {
            assetId, claimToken, leaseExpiresAt, workerId, profile, attemptNumber,
            sourceSha256: typeof job["sourceSha256"] === "string" ? job["sourceSha256"] : null,
            hlsEncryption: flags.hlsEncryption,
            sourceDownloadUrl: sourceTarget.signedUrl,
            sourceFilename: job["sourceFilename"], sourceSizeBytes: job["sourceSizeBytes"],
            outputDestinationId: outputReservation.destinationId, outputPrefix, outputReservedBytes: reservedBytes,
          } });
        } catch (error) {
          if (newReservationId) await releaseStorageReservation(fs, newReservationId).catch(() => undefined);
          await fs.patchDoc(jobPath, {
            status: "queued", workerStatus: "waiting_for_storage", claimToken: null,
            leaseExpiresAt: null, lastErrorCode: error instanceof ApiError ? error.code : "WORKER_CLAIM_FAILED",
            updatedAt: new Date().toISOString(),
          }).catch(() => undefined);
          if (error instanceof ApiError && error.status < 500) throw error;
        }
      }
      return Response.json({ job: null });
    } catch (error) { return errorBody(error); }
  } } },
});
