import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAuthorizedChannelUpload } from "@/lib/server/producer-upload-access";
import { assertMediaMatchesExtension } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";
import { loadSourceStorageConfiguration, inspectStorageObject } from "@/lib/server/storage/transfers";
import { commitStorageReservation } from "@/lib/server/storage/reservations";
import { wakeModalVideoWorker } from "@/lib/server/modal-wake";

const bodySchema = z.object({
  assetId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
});

export const Route = createFileRoute("/api/public/v1/storage/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const { assetId } = await parseBody(request, bodySchema);
          const fs = await Firestore.create();
          const asset = await fs.getDoc("contentAssets/" + assetId);
          if (!asset || asset["ownerUid"] !== user.uid) {
            throw new ApiError(404, "UPLOAD_NOT_FOUND", "This upload does not exist.");
          }
          if (asset["status"] !== "uploading") {
            throw new ApiError(409, "UPLOAD_NOT_PENDING", "This upload is no longer awaiting completion.");
          }
          const expiresAt = typeof asset["uploadExpiresAt"] === "string" ? Date.parse(asset["uploadExpiresAt"]) : 0;
          if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
            throw new ApiError(410, "UPLOAD_INTENT_EXPIRED", "The upload authorization has expired.");
          }
          const channelId = typeof asset["channelId"] === "string" ? asset["channelId"] : "";
          await requireAuthorizedChannelUpload(fs, channelId, user);
          const path = typeof asset["sourcePath"] === "string" ? asset["sourcePath"] : "";
          const filename = typeof asset["sourceFilename"] === "string" ? asset["sourceFilename"] : "";
          const expectedSize = typeof asset["declaredSizeBytes"] === "number" ? asset["declaredSizeBytes"] : 0;
          if (!path.startsWith(`producers/${user.uid}/${channelId}/${assetId}/`) || !filename || expectedSize < 1) {
            throw new ApiError(409, "UPLOAD_METADATA_INVALID", "The upload metadata is invalid.");
          }

          const sourceConfiguration = await loadSourceStorageConfiguration(fs, asset);
          const sourceObjectKey = typeof asset["sourceObjectKey"] === "string" ? asset["sourceObjectKey"] : path;
          const inspected = await inspectStorageObject(sourceConfiguration, sourceObjectKey);
          const actualSize = inspected.sizeBytes;
          if (actualSize !== expectedSize) {
            throw new ApiError(400, "UPLOAD_SIZE_MISMATCH", "The uploaded file size does not match the declared size.");
          }
          const mediaKind = assertMediaMatchesExtension(inspected.headerBytes, filename);
          const now = new Date().toISOString();
          const sourceDestinationId = typeof asset["sourceDestinationId"] === "string"
            ? asset["sourceDestinationId"] : "lovable-source-legacy";
          const jobPath = "videoTranscodeJobs/" + assetId;
          const existingJob = await fs.getDoc(jobPath);
          if (!existingJob) {
            await fs.setDoc(jobPath, {
              assetId,
              channelId,
              ownerUid: user.uid,
              sourceDestinationId,
              sourceBucket: typeof asset["sourceBucket"] === "string" ? asset["sourceBucket"] : "bq-sqwad-source-media",
              sourcePath: path,
              sourceObjectKey,
              sourceFilename: filename,
              sourceSizeBytes: actualSize,
              outputDestinationId: null,
              outputPrefix: null,
              status: "queued",
              workerStatus: "waiting_for_worker",
              attempts: 0,
              createdAt: now,
              updatedAt: now,
            }, { mustNotExist: true });
          } else if (existingJob["assetId"] !== assetId || existingJob["ownerUid"] !== user.uid) {
            throw new ApiError(409, "TRANSCODE_JOB_CONFLICT", "A conflicting processing job already exists for this asset.");
          }
          const reservationId = typeof asset["storageReservationId"] === "string" ? asset["storageReservationId"] : null;
          if (reservationId) await commitStorageReservation(fs, reservationId, actualSize);
          await fs.patchDoc("contentAssets/" + assetId, {
            sourceDestinationId,
            sourceObjectKey,
            sourceBucket: typeof asset["sourceBucket"] === "string" ? asset["sourceBucket"] : "bq-sqwad-source-media",
            storageReservationStatus: reservationId ? "committed" : "legacy_unreserved",
          });
          await fs.patchDoc("contentAssets/" + assetId, {
            status: "uploaded_pending_transcode",
            transcodeJobId: assetId,
            transcodeJobStatus: "queued",
            sourceVerified: true,
            sourceMediaKind: mediaKind,
            actualSizeBytes: actualSize,
            sourceVerifiedAt: now,
            updatedAt: now,
          });
          await writeAuditLog(fs, {
            actorUid: user.uid, action: "content.upload_verified",
            targetType: "contentAsset", targetId: assetId,
            reason: "Source upload verified before transcoding",
            metadata: { channelId, mediaKind, sizeBytes: actualSize, sourceDestinationId },
          });
          await wakeModalVideoWorker();
          return Response.json({ assetId, status: "uploaded_pending_transcode", sourceVerified: true, transcodeJobId: assetId, transcodeJobStatus: "queued", processingWorker: "waiting_for_worker" });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
