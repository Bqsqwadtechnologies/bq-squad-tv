import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { isSafeStoragePath } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";
import { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } from "@/lib/server/storage/registry";
import { createStorageProviderAdapter } from "@/lib/server/storage/providers";

const schema = z.object({ storagePath: z.string().min(1).max(1024), reason: z.string().trim().min(3).max(1000) });

export const Route = createFileRoute("/api/public/v1/admin/content-assets/$assetId/ready")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      const assetId = params.assetId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) throw new ApiError(400, "ASSET_ID_INVALID", "The asset id is invalid.");
      const fs = await Firestore.create();
      await requireAdminModule(fs, user, "content");
      const asset = await fs.getDoc("contentAssets/" + assetId);
      if (!asset || asset["deliveryMode"] !== "bq_hosted" || asset["sourceVerified"] !== true) {
        throw new ApiError(409, "ASSET_NOT_ELIGIBLE", "Only verified BQ-hosted source uploads can be submitted for review.");
      }
      const license = asset["license"] as Record<string, unknown> | undefined;
      if (license?.["status"] !== "verified" || license["verificationStatus"] !== "verified") {
        throw new ApiError(403, "CONTENT_RIGHTS_NOT_VERIFIED", "Verified distribution rights are required before processing can be completed.");
      }
      const destinationId = typeof asset["streamDestinationId"] === "string" ? asset["streamDestinationId"] : "";
      const attemptPrefix = "hls/" + assetId + "/a";
      const attemptFolder = body.storagePath.slice(0, body.storagePath.lastIndexOf("/"));
      const attemptNumber = attemptFolder.startsWith(attemptPrefix) ? attemptFolder.slice(attemptPrefix.length) : "";
      if (!isSafeStoragePath(body.storagePath) || !/^[1-9][0-9]*$/.test(attemptNumber) ||
          !body.storagePath.endsWith("/master.m3u8") || !destinationId) {
        throw new ApiError(400, "STREAM_MANIFEST_PATH_INVALID", "The HLS master playlist must be inside this asset's assigned output folder.");
      }
      const rawDestination = await fs.getDoc("storageDestinations/" + destinationId);
      if (!rawDestination) throw new ApiError(503, "HLS_DESTINATION_MISSING", "The assigned storage location is unavailable.");
      const destination = validateStorageDestinationMetadata({ ...rawDestination, destinationId });
      const config = resolveStorageDestinationConfiguration(destination);
      if (config.configurationStatus !== "configured") throw new ApiError(503, "HLS_DESTINATION_MISCONFIGURED", "The assigned storage location is not configured.");
      const adapter = createStorageProviderAdapter(config);
      const downloaded = await adapter.getObject(body.storagePath);
      if (downloaded.info.sizeBytes > 2_000_000) throw new ApiError(413, "STREAM_MANIFEST_TOO_LARGE", "The HLS master playlist exceeds the inspection limit.");
      const manifest = new TextDecoder().decode(downloaded.body);
      if (!manifest.replace(/^\uFEFF/, "").trimStart().startsWith("#EXTM3U")) {
        throw new ApiError(415, "STREAM_MANIFEST_INVALID", "The uploaded HLS master playlist is invalid.");
      }
      const now = new Date().toISOString();
      await fs.patchDoc("contentAssets/" + assetId, {
        storagePath: body.storagePath,
        status: "processed_pending_review",
        contentStatus: "draft",
        deliveryMode: "bq_hosted",
        masterPlaylistValid: true,
        ownerReviewRequired: true,
        ownerReviewRequiredAt: now,
        updatedAt: now,
      });
      await writeAuditLog(fs, {
        actorUid: user.uid,
        action: "content.asset_submitted_for_review",
        targetType: "contentAsset",
        targetId: assetId,
        reason: body.reason,
        metadata: { deliveryMode: "bq_hosted" },
      });
      return Response.json({ assetId, status: "processed_pending_review", deliveryMode: "bq_hosted" });
    } catch (error) { return errorBody(error); }
  } } },
});
