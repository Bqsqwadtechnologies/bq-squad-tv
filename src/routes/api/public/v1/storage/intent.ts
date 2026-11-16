import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAuthorizedChannelUpload } from "@/lib/server/producer-upload-access";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSafeStoragePath } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";
import { reserveStorageDestination, releaseStorageReservation } from "@/lib/server/storage/reservations";
import { createStorageUploadTarget } from "@/lib/server/storage/transfers";
import { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } from "@/lib/server/storage/registry";

// Single-request S3 PUT ceiling; multipart upload support is a later storage batch.
const MAX_SOURCE_BYTES = 5_000_000_000;
const mimeByExtension: Record<string, string[]> = {
  mp4: ["video/mp4"],
  mov: ["video/quicktime"],
  mkv: ["video/x-matroska"],
  webm: ["video/webm"],
};

const bodySchema = z.object({
  channelId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  filename: z.string().min(1).max(180),
  sizeBytes: z.number().int().positive().max(MAX_SOURCE_BYTES),
  mimeType: z.string().min(1).max(100),
});

function safeFilename(value: string): string {
  const leaf = value.split(/[\\/]/).pop() ?? "";
  const normalized = leaf.normalize("NFKC").replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, "_");
  if (!normalized || normalized === "." || normalized === ".." || normalized.length > 160) {
    throw new ApiError(400, "INVALID_FILENAME", "The upload filename is invalid.");
  }
  return normalized;
}

export const Route = createFileRoute("/api/public/v1/storage/intent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, bodySchema);
          const fs = await Firestore.create();
          await enforceRateLimit(fs, "storage-intent:" + user.uid, { limit: 10, windowMs: 5 * 60_000 });
          await requireAuthorizedChannelUpload(fs, body.channelId, user);

          const filename = safeFilename(body.filename);
          const extension = filename.toLowerCase().split(".").pop() ?? "";
          if (!mimeByExtension[extension]?.includes(body.mimeType.toLowerCase())) {
            throw new ApiError(415, "UPLOAD_TYPE_NOT_ALLOWED", "Only MP4, MOV, MKV and WebM source videos are accepted.");
          }
          const channel = await fs.getDoc("channels/" + body.channelId);
          if (!channel || String(channel["status"] ?? "").toUpperCase() === "SUSPENDED" || channel["deleted"] === true) {
            throw new ApiError(404, "CHANNEL_NOT_AVAILABLE", "This channel is not available for uploads.");
          }

          const assetId = crypto.randomUUID().replace(/-/g, "");
          const path = `producers/${user.uid}/${body.channelId}/${assetId}/${filename}`;
          if (!isSafeStoragePath(path)) throw new ApiError(400, "UPLOAD_PATH_INVALID", "The generated upload path is invalid.");

          const reservation = await reserveStorageDestination(fs, {
            purpose: "source_media",
            incomingBytes: body.sizeBytes,
            reservationId: assetId,
            ttlMs: 2 * 60 * 60_000,
          });
          try {
            const rawDestination = await fs.getDoc("storageDestinations/" + reservation.destinationId);
            if (!rawDestination) throw new ApiError(503, "STORAGE_DESTINATION_MISSING", "The selected storage destination is unavailable.");
            const metadata = validateStorageDestinationMetadata({ ...rawDestination, destinationId: reservation.destinationId });
            const configuration = resolveStorageDestinationConfiguration(metadata);
            const target = await createStorageUploadTarget(configuration, path, 900);
            const now = new Date();
            const expiresAt = new Date(now.getTime() + target.expiresInSeconds * 1000).toISOString();
            await fs.setDoc("contentAssets/" + assetId, {
              channelId: body.channelId,
              ownerUid: user.uid,
              sourceDestinationId: reservation.destinationId,
              sourceBucket: metadata.bucketName,
              sourcePath: path,
              sourceObjectKey: path,
              sourceFilename: filename,
              declaredSizeBytes: body.sizeBytes,
              declaredMimeType: body.mimeType.toLowerCase(),
              storageReservationId: reservation.reservationId,
              storageReservationBytes: reservation.reservedBytes,
              status: "uploading",
              deliveryMode: "bq_hosted",
              createdAt: now.toISOString(),
              uploadExpiresAt: expiresAt,
              uploadTokenLifetimeSeconds: target.expiresInSeconds,
            }, { mustNotExist: true });
            await writeAuditLog(fs, {
              actorUid: user.uid, action: "content.upload_intent_created",
              targetType: "contentAsset", targetId: assetId,
              reason: "Authorized channel source upload",
              metadata: { channelId: body.channelId, sizeBytes: body.sizeBytes, extension, destinationId: reservation.destinationId },
            });
            return Response.json({
              assetId,
              path,
              bucket: metadata.bucketName,
              destinationId: reservation.destinationId,
              providerType: metadata.providerType,
              signedUrl: target.signedUrl,
              ...(target.token ? { token: target.token } : {}),
              expiresAt,
              method: target.method,
              uploadMode: "signed_put",
              resumableEndpoint: null,
              resumableSignatureHeader: null,
            }, { status: 201 });
          } catch (error) {
            await releaseStorageReservation(fs, reservation.reservationId).catch(() => undefined);
            throw error;
          }

        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
