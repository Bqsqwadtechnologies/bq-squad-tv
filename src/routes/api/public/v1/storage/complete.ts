import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAuthorizedChannelUpload } from "@/lib/server/producer-upload-access";
import { assertMediaMatchesExtension } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";
import {
  loadSourceStorageConfiguration,
  inspectStorageObject,
} from "@/lib/server/storage/transfers";
import { commitStorageReservation } from "@/lib/server/storage/reservations";
import { wakeModalVideoWorker } from "@/lib/server/modal-wake";
import {
  computePerceptualFingerprint,
  detectDuplicatesAndFlag,
  checkExternalCopyrightService,
} from "@/lib/server/copyright/fingerprint";

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
            throw new ApiError(
              409,
              "UPLOAD_NOT_PENDING",
              "This upload is no longer awaiting completion.",
            );
          }
          const expiresAt =
            typeof asset["uploadExpiresAt"] === "string" ? Date.parse(asset["uploadExpiresAt"]) : 0;
          if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
            throw new ApiError(
              410,
              "UPLOAD_INTENT_EXPIRED",
              "The upload authorization has expired.",
            );
          }
          const channelId = typeof asset["channelId"] === "string" ? asset["channelId"] : "";
          await requireAuthorizedChannelUpload(fs, channelId, user);
          const path = typeof asset["sourcePath"] === "string" ? asset["sourcePath"] : "";
          const filename =
            typeof asset["sourceFilename"] === "string" ? asset["sourceFilename"] : "";
          const expectedSize =
            typeof asset["declaredSizeBytes"] === "number" ? asset["declaredSizeBytes"] : 0;
          if (
            !path.startsWith(`producers/${user.uid}/${channelId}/${assetId}/`) ||
            !filename ||
            expectedSize < 1
          ) {
            throw new ApiError(409, "UPLOAD_METADATA_INVALID", "The upload metadata is invalid.");
          }

          const sourceConfiguration = await loadSourceStorageConfiguration(fs, asset);
          const sourceObjectKey =
            typeof asset["sourceObjectKey"] === "string" ? asset["sourceObjectKey"] : path;
          let inspected: Awaited<ReturnType<typeof inspectStorageObject>> | null = null;
          let lastInspectionError: unknown = null;
          for (let attempt = 0; attempt < 8; attempt++) {
            try {
              inspected = await inspectStorageObject(sourceConfiguration, sourceObjectKey);
              break;
            } catch (error) {
              lastInspectionError = error;
              const code = error instanceof ApiError ? error.code : "";
              const retryable = [
                "UPLOAD_OBJECT_MISSING",
                "STORAGE_SIZE_UNAVAILABLE",
                "STORAGE_OBJECT_UNAVAILABLE",
              ].includes(code);
              if (!retryable || attempt === 7) throw error;
              // Signed PUT success can precede object visibility at the storage edge.
              await new Promise((resolve) => setTimeout(resolve, Math.min(350 + attempt * 250, 2_000)));
            }
          }
          if (!inspected) throw lastInspectionError ?? new ApiError(503, "STORAGE_OBJECT_UNAVAILABLE", "The uploaded video could not be verified.");
          const actualSize = inspected.sizeBytes;
          if (actualSize !== expectedSize) {
            throw new ApiError(
              400,
              "UPLOAD_SIZE_MISMATCH",
              "The uploaded file size does not match the declared size.",
            );
          }
          const mediaKind = assertMediaMatchesExtension(inspected.headerBytes, filename);
          const { fileHash, perceptualFingerprint } = computePerceptualFingerprint(
            inspected.headerBytes,
            undefined,
            actualSize,
          );
          const dupResult = await detectDuplicatesAndFlag(
            fs,
            assetId,
            user.uid,
            fileHash,
            perceptualFingerprint,
          );
          const externalMatch = await checkExternalCopyrightService({
            assetId,
            fileHash,
            perceptualFingerprint,
            filename,
            sizeBytes: actualSize,
          });
          const isDuplicate = dupResult.duplicateDetected || externalMatch.matched;
          const duplicateOfTitle =
            dupResult.duplicateOfTitle ||
            (externalMatch.matched ? externalMatch.details || "External catalogue" : null);
          const reviewQueueFlag =
            dupResult.reviewQueueFlag ||
            (externalMatch.matched ? `Possible copyright match: ${duplicateOfTitle}` : null);
          const now = new Date().toISOString();
          const sourceDestinationId =
            typeof asset["sourceDestinationId"] === "string"
              ? asset["sourceDestinationId"]
              : "lovable-source-legacy";
          const jobPath = "videoTranscodeJobs/" + assetId;
          const existingJob = await fs.getDoc(jobPath);
          if (!existingJob) {
            await fs.setDoc(
              jobPath,
              {
                assetId,
                channelId,
                ownerUid: user.uid,
                sourceDestinationId,
                sourceBucket:
                  typeof asset["sourceBucket"] === "string"
                    ? asset["sourceBucket"]
                    : "bq-sqwad-source-media",
                sourcePath: path,
                sourceObjectKey,
                sourceFilename: filename,
                sourceSizeBytes: actualSize,
                transcodeProfile:
                  asset["transcodeProfile"] === "economy" || asset["transcodeProfile"] === "high"
                    ? asset["transcodeProfile"]
                    : "standard",
                outputDestinationId: null,
                outputPrefix: null,
                status: "queued",
                workerStatus: "waiting_for_worker",
                attempts: 0,
                createdAt: now,
                updatedAt: now,
              },
              { mustNotExist: true },
            );
          } else {
            if (
              existingJob["assetId"] !== assetId ||
              existingJob["ownerUid"] !== user.uid ||
              existingJob["sourceObjectKey"] !== sourceObjectKey ||
              existingJob["sourceSizeBytes"] !== actualSize
            ) {
              throw new ApiError(
                409,
                "TRANSCODE_JOB_CONFLICT",
                "A conflicting processing job already exists for this asset.",
              );
            }
            if (existingJob["status"] !== "queued") {
              throw new ApiError(
                409,
                "TRANSCODE_JOB_ALREADY_EXISTS",
                "This asset already has a processing history. Use the explicit reprocess action to create a new attempt.",
              );
            }
          }
          const reservationId =
            typeof asset["storageReservationId"] === "string"
              ? asset["storageReservationId"]
              : null;
          if (reservationId) await commitStorageReservation(fs, reservationId, actualSize);
          await fs.patchDoc("contentAssets/" + assetId, {
            sourceDestinationId,
            sourceObjectKey,
            sourceBucket:
              typeof asset["sourceBucket"] === "string"
                ? asset["sourceBucket"]
                : "bq-sqwad-source-media",
            storageReservationStatus: reservationId ? "committed" : "legacy_unreserved",
          });
          await fs.patchDoc("contentAssets/" + assetId, {
            status: "uploaded_pending_transcode",
            transcodeJobId: assetId,
            transcodeJobStatus: "queued",
            sourceVerified: true,
            sourceMediaKind: mediaKind,
            actualSizeBytes: actualSize,
            fileHash,
            perceptualFingerprint,
            checksumSha256: asset["checksumSha256"] || fileHash,
            duplicateDetected: isDuplicate,
            duplicateOfAssetId: dupResult.duplicateOfAssetId,
            duplicateOfTitle,
            duplicateType: dupResult.duplicateType,
            reviewQueueFlag,
            rightsReviewStatus: isDuplicate ? "flagged" : (asset["isPlatformAsset"] === true ? "verified" : "pending"),
            ownerReviewRequired: isDuplicate || (asset["isPlatformAsset"] === true ? false : true),
            ...(asset["isPlatformAsset"] === true && asset["directPublish"] === true && !isDuplicate ? { contentStatus: "published", published: true } : {}),
            externalCopyrightCheck: externalMatch,
            sourceVerifiedAt: now,
            updatedAt: now,
          });
          if (isDuplicate) {
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "content.duplicate_flagged",
              targetType: "contentAsset",
              targetId: assetId,
              reason: reviewQueueFlag || "Possible duplicate detected during upload verification",
              metadata: {
                channelId,
                fileHash,
                perceptualFingerprint,
                duplicateOfAssetId: dupResult.duplicateOfAssetId,
                duplicateOfTitle,
              },
            });
          }
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "content.upload_verified",
            targetType: "contentAsset",
            targetId: assetId,
            reason: "Source upload verified before transcoding",
            metadata: { channelId, mediaKind, sizeBytes: actualSize, sourceDestinationId },
          });
          await wakeModalVideoWorker(fs);
          return Response.json({
            assetId,
            status: "uploaded_pending_transcode",
            sourceVerified: true,
            transcodeJobId: assetId,
            transcodeJobStatus: "queued",
            processingWorker: "waiting_for_worker",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
