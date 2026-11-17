import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";
import { isVideoWorkerLeaseActive } from "@/lib/server/video-worker-policy";
import { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } from "@/lib/server/storage/registry";
import { createStorageProviderAdapter } from "@/lib/server/storage/providers";
import { commitStorageReservation } from "@/lib/server/storage/reservations";
import { assertStorageObjectKey } from "@/lib/server/storage/ledger";
import { listAllStorageObjects } from "@/lib/server/storage/listing";
import { resolveHlsReference } from "@/lib/server/streaming/hls-playlist";
import { sendPushNotificationToUser } from "@/lib/server/notifications";
import { estimateModalComputeCost } from "@/lib/server/modal-spend";
import { getPlatformFlags } from "@/lib/server/flags";
import { encryptHlsContentKey, getStreamingSourceKey } from "@/lib/server/streaming/source-encryption";

const schema = z.object({
  claimToken: z.string().regex(/^[a-f0-9]{32}$/),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  hlsEncryptionKey: z.string().regex(/^[A-Za-z0-9_-]{22}$/).optional(),
  files: z.array(z.object({ key: z.string().min(1).max(1024), sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })).min(2).max(20000),
  computeUsage: z.object({
    cores: z.number().finite().min(0.125).max(64),
    memoryGiB: z.number().finite().min(0.125).max(512),
    seconds: z.number().int().min(0).max(10_800),
  }).optional(),
  outputResolutions: z.array(z.number().int().min(1).max(4320)).max(8).optional(),
});

export const Route = createFileRoute("/api/public/v1/worker/jobs/$assetId/complete")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const fs = await Firestore.create();
      const workerId = await requireVideoWorker(request, fs);
      const body = await parseBody(request, schema);
      const assetId = params.assetId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) throw new ApiError(400, "WORKER_JOB_INVALID", "The processing job identifier is invalid.");
      const jobPath = "videoTranscodeJobs/" + assetId;
      const job = await fs.getDoc(jobPath);
      if (!job || job["status"] !== "processing" || job["claimToken"] !== body.claimToken || job["workerId"] !== workerId ||
          !isVideoWorkerLeaseActive(job["leaseExpiresAt"])) {
        throw new ApiError(409, "WORKER_LEASE_INVALID", "The processing job lease is no longer valid.");
      }
      if (typeof job["sourceSha256"] === "string" && body.sourceSha256 &&
          job["sourceSha256"].toLowerCase() !== body.sourceSha256.toLowerCase()) {
        throw new ApiError(409, "SOURCE_HASH_MISMATCH", "The downloaded source does not match the previously verified source.");
      }
      const destinationId = typeof job["outputDestinationId"] === "string" ? job["outputDestinationId"] : "";
      const prefix = typeof job["outputPrefix"] === "string" ? job["outputPrefix"] : "";
      const reservationId = typeof job["outputReservationId"] === "string" ? job["outputReservationId"] : "";
      if (!destinationId || !prefix || !reservationId) throw new ApiError(409, "WORKER_OUTPUT_NOT_RESERVED", "The HLS output destination was not reserved.");
      const keys = new Set<string>();
      let totalBytes = 0;
      for (const file of body.files) {
        const key = assertStorageObjectKey(file.key);
        if (!key.startsWith(prefix + "/") || keys.has(key) || !/\.(m3u8|ts)$/i.test(key)) throw new ApiError(400, "WORKER_OUTPUT_INVALID", "The output file list contains an invalid object key.");
        keys.add(key);
        totalBytes += file.sizeBytes;
        if (!Number.isSafeInteger(totalBytes)) throw new ApiError(400, "WORKER_OUTPUT_INVALID", "The total output size is invalid.");
      }
      const masterKey = prefix + "/master.m3u8";
      if (!keys.has(masterKey)) throw new ApiError(400, "WORKER_MASTER_MISSING", "The HLS master playlist is missing.");
      const rawDestination = await fs.getDoc("storageDestinations/" + destinationId);
      if (!rawDestination) throw new ApiError(503, "HLS_DESTINATION_MISSING", "The HLS destination is unavailable.");
      const metadata = validateStorageDestinationMetadata({ ...rawDestination, destinationId });
      const config = resolveStorageDestinationConfiguration(metadata);
      if (config.configurationStatus !== "configured") throw new ApiError(503, "HLS_DESTINATION_MISCONFIGURED", "The HLS destination is not configured.");
      const adapter = createStorageProviderAdapter(config);
      const listedObjects = await listAllStorageObjects(adapter, prefix);
      const listedByKey = new Map(listedObjects.map(item => [item.key, item.sizeBytes]));
      if (listedByKey.size !== listedObjects.length || listedByKey.size !== body.files.length) {
        throw new ApiError(409, "HLS_OBJECT_COUNT_MISMATCH", "The uploaded file count does not match the storage listing.");
      }
      let listedBytes = 0;
      for (const file of body.files) {
        const listedSize = listedByKey.get(file.key);
        if (listedSize === undefined || listedSize !== file.sizeBytes) {
          throw new ApiError(409, "HLS_OBJECT_VERIFICATION_FAILED", "An uploaded HLS object failed storage verification.");
        }
        listedBytes += listedSize;
        if (!Number.isSafeInteger(listedBytes)) throw new ApiError(409, "HLS_OUTPUT_INVALID", "The total HLS output size is invalid.");
      }
      if (listedObjects.some(item => !keys.has(item.key)) || listedBytes !== totalBytes) {
        throw new ApiError(409, "HLS_OBJECT_SET_MISMATCH", "The storage listing contains unreported or unexpected files.");
      }
      const playlistKeys = body.files.filter(file => file.key.toLowerCase().endsWith(".m3u8")).map(file => file.key);
      let masterRenditionCount = 0;
      const referencedKeys = new Set<string>([masterKey]);
      for (const playlistKey of playlistKeys) {
        const downloaded = await adapter.getObject(playlistKey);
        if (downloaded.info.sizeBytes > 2_000_000) throw new ApiError(413, "HLS_PLAYLIST_TOO_LARGE", "An HLS playlist exceeds the verification limit.");
        const playlist = new TextDecoder().decode(downloaded.body);
        if (!playlist.trimStart().startsWith("#EXTM3U") || (playlistKey !== masterKey && !playlist.includes("#EXT-X-ENDLIST"))) {
          throw new ApiError(409, "HLS_PLAYLIST_INVALID", "An uploaded HLS playlist is invalid or incomplete.");
        }
        const lines = playlist.split(/\r?\n/);
        let expectReference = false;
        let referenceCount = 0;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith("#EXT-X-STREAM-INF:")) { expectReference = true; continue; }
          const references: string[] = [];
          if (trimmed.startsWith("#")) {
            for (const match of trimmed.matchAll(/URI\s*=\s*"([^"]+)"/gi)) if (match[1] && !match[1].startsWith("data:")) references.push(match[1]);
          } else references.push(trimmed);
          for (const reference of references) {
            const resolved = resolveHlsReference(playlistKey, reference);
            if (!keys.has(resolved)) throw new ApiError(409, "HLS_REFERENCE_MISSING", "An HLS playlist references an object that was not uploaded.");
            referencedKeys.add(resolved);
            referenceCount++;
            if (playlistKey === masterKey) masterRenditionCount++;
            expectReference = false;
          }
        }
        if (expectReference) throw new ApiError(409, "HLS_PLAYLIST_INVALID", "The HLS master playlist contains an incomplete rendition reference.");
        if (referenceCount === 0) throw new ApiError(409, "HLS_PLAYLIST_EMPTY", "An HLS playlist does not reference any media objects.");
      }
      if (masterRenditionCount === 0) throw new ApiError(409, "HLS_MASTER_EMPTY", "The HLS master playlist contains no verified renditions.");
      if (referencedKeys.size !== keys.size || [...keys].some(key => !referencedKeys.has(key))) {
        throw new ApiError(409, "HLS_UNREFERENCED_OBJECT", "The output contains files that are not referenced by its playlists.");
      }
      const flags = await getPlatformFlags(fs);
      let encryptedHlsKey: Awaited<ReturnType<typeof encryptHlsContentKey>> | null = null;
      if (flags.hlsEncryption) {
        if (!body.hlsEncryptionKey) {
          throw new ApiError(409, "HLS_ENCRYPTION_KEY_REQUIRED", "The encrypted HLS package is missing its content key.");
        }
        const wrappingKey = getStreamingSourceKey();
        encryptedHlsKey = await encryptHlsContentKey(
          body.hlsEncryptionKey,
          assetId,
          wrappingKey.keyVersion,
          wrappingKey.keyBase64Url,
        );
      } else if (body.hlsEncryptionKey) {
        throw new ApiError(409, "HLS_ENCRYPTION_NOT_ENABLED", "This job was not assigned encrypted HLS output.");
      }
      const reservation = await fs.getDoc("storageReservations/" + reservationId);
      const reservedBytes = typeof reservation?.["reservedBytes"] === "number" ? reservation["reservedBytes"] : 0;
      if (totalBytes > reservedBytes) throw new ApiError(409, "HLS_OUTPUT_EXCEEDS_RESERVATION", "The HLS output exceeded its reserved storage capacity.");
      await commitStorageReservation(fs, reservationId, totalBytes);
      const now = new Date().toISOString();
      await fs.patchDoc("contentAssets/" + assetId, {
        status: "processed_pending_review", transcodeJobStatus: "completed", streamDestinationId: destinationId,
        ...(body.sourceSha256 ? { sourceSha256: body.sourceSha256.toLowerCase() } : {}),
        hlsEncryptionEnabled: flags.hlsEncryption,
        ...(encryptedHlsKey ? { encryptedHlsKey } : {}),
        streamObjectPrefix: prefix, storagePath: masterKey, hlsManifestKey: masterKey,
        actualHlsBytes: totalBytes, hlsVerifiedAt: now,
        outputResolutions: body.outputResolutions ?? [],
        masterPlaylistValid: true, allSegmentsVerified: true,
        expectedObjectCount: body.files.length, uploadedObjectCount: listedObjects.length,
        ownerReviewRequired: true, ownerReviewRequiredAt: now, updatedAt: now,
      });
      const usage = body.computeUsage;
      const cores = usage?.cores ?? 0;
      const memoryGiB = usage?.memoryGiB ?? 0;
      const seconds = usage?.seconds ?? 0;
      const estimatedCostUsd = estimateModalComputeCost(cores, memoryGiB, seconds);
      const month = now.slice(0, 7);
      const attempt = typeof job["attemptSequence"] === "number" ? job["attemptSequence"] : 1;
      const usageId = month + "-" + assetId + "-a" + attempt;
      await fs.setDoc("modalUsage/" + usageId, {
        month, assetId, attempt, cores, memoryGiB, seconds,
        outputBytes: totalBytes, estimatedCostUsd, recordedAt: now,
      });
      await fs.patchDoc(jobPath, {
        status: "completed", workerStatus: "completed", outputBytes: totalBytes,
        ...(body.sourceSha256 ? { sourceSha256: body.sourceSha256.toLowerCase() } : {}),
        outputFileCount: body.files.length, outputResolutions: body.outputResolutions ?? [],
        completedAt: now, updatedAt: now,
        modalCores: cores, modalMemoryGiB: memoryGiB, modalSeconds: seconds,
        modalEstimatedCostUsd: estimatedCostUsd, modalUsageMonth: month,
        claimToken: null, leaseExpiresAt: null,
      });
      try {
        const ownerEmail = (process.env["ZILLIONAIRE_EMAIL"] ?? "").trim().toLowerCase();
        if (ownerEmail) {
          const owners = await fs.query("users", {
            filters: [{ field: "email", op: "EQUAL", value: ownerEmail }],
            limit: 1,
          });
          const ownerUid = owners[0]?.__id;
          if (ownerUid) {
            const notificationId = crypto.randomUUID().replace(/-/g, "");
            await fs.setDoc("users/" + ownerUid + "/notifications/" + notificationId, {
              title: "A video is ready for review",
              body: "A processed video has passed its file checks and is waiting for your review.",
              deepLink: "/admin/video-studio",
              read: false,
              deliveryStatus: "pending",
              createdAt: now,
            });
            await sendPushNotificationToUser(fs, ownerUid, {
              notificationId,
              title: "A video is ready for review",
              body: "A processed video is waiting for your review.",
              deepLink: "/admin/video-studio",
            }).catch(() => undefined);
          }
        }
      } catch {
        console.error("Owner review notification could not be delivered", { assetId });
      }
      return Response.json({ assetId, status: "processed_pending_review", destinationId, manifestKey: masterKey, outputBytes: totalBytes, outputFileCount: body.files.length });
    } catch (error) { return errorBody(error); }
  } } },
});
