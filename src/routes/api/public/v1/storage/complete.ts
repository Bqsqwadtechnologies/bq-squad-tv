import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireChannelPermission } from "@/lib/server/channel-access";
import { assertMediaMatchesExtension } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";

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
          await requireChannelPermission(fs, channelId, user.uid, "video.upload");
          const path = typeof asset["sourcePath"] === "string" ? asset["sourcePath"] : "";
          const filename = typeof asset["sourceFilename"] === "string" ? asset["sourceFilename"] : "";
          const expectedSize = typeof asset["declaredSizeBytes"] === "number" ? asset["declaredSizeBytes"] : 0;
          if (!path.startsWith(`producers/${user.uid}/${channelId}/${assetId}/`) || !filename || expectedSize < 1) {
            throw new ApiError(409, "UPLOAD_METADATA_INVALID", "The upload metadata is invalid.");
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: signed, error: signError } = await supabaseAdmin.storage
            .from("bq-sqwad-source-media")
            .createSignedUrl(path, 60);
          if (signError || !signed?.signedUrl) {
            throw new ApiError(503, "STORAGE_OBJECT_UNAVAILABLE", "The uploaded file could not be inspected.");
          }
          const response = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-511" } });
          if (response.status !== 206) {
            throw new ApiError(409, "UPLOAD_OBJECT_MISSING", "The uploaded file could not be found in private storage.");
          }
          const contentLengthHeader = Number(response.headers.get("content-length") ?? 0);
          if (contentLengthHeader > 512) {
            await response.body?.cancel();
            throw new ApiError(502, "STORAGE_RANGE_UNSUPPORTED", "Private storage did not honor the bounded media inspection request.");
          }
          const headerBytes = new Uint8Array(await response.arrayBuffer());
          const contentRange = response.headers.get("content-range");
          const contentLength = response.headers.get("content-length");
          const actualSize = contentRange?.match(/\/([0-9]+)$/)?.[1]
            ? Number(contentRange.match(/\/([0-9]+)$/)?.[1])
            : Number(contentLength);
          if (!Number.isSafeInteger(actualSize) || actualSize !== expectedSize) {
            throw new ApiError(400, "UPLOAD_SIZE_MISMATCH", "The uploaded file size does not match the declared size.");
          }
          const mediaKind = assertMediaMatchesExtension(headerBytes, filename);
          const now = new Date().toISOString();
          await fs.patchDoc("contentAssets/" + assetId, {
            status: "uploaded_pending_transcode",
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
            metadata: { channelId, mediaKind, sizeBytes: actualSize },
          });
          return Response.json({ assetId, status: "uploaded_pending_transcode", sourceVerified: true });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
