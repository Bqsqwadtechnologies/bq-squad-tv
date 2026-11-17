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
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(params.assetId)) throw new ApiError(400, "ASSET_ID_INVALID", "The asset id is invalid.");
      const fs = await Firestore.create();
      await requireAdminModule(fs, user, "content");
      const asset = await fs.getDoc("contentAssets/" + params.assetId);
      if (!asset || asset["deliveryMode"] !== "bq_hosted" || asset["sourceVerified"] !== true) {
        throw new ApiError(409, "ASSET_NOT_ELIGIBLE", "Only verified BQ-hosted source uploads can be marked ready.");
      }
      const license = asset["license"] as Record<string, unknown> | undefined;
      if (license?.["status"] !== "verified" || license["verificationStatus"] !== "verified") {
        throw new ApiError(403, "CONTENT_RIGHTS_NOT_VERIFIED", "Verified distribution rights are required before processing can be completed.");
      }
      const channelId = typeof asset["channelId"] === "string" ? asset["channelId"] : "";
      const destinationId = typeof asset["streamDestinationId"] === "string" ? asset["streamDestinationId"] : "";
      if (!isSafeStoragePath(body.storagePath) ||
          !new RegExp("^hls/" + params.assetId.replace(/[.*+?^\u0024{}()|[\]\\\\]/g, "\\      if (!isSafeStoragePath(body.storagePath) || !body.storagePath.startsWith("streaming/" + params.assetId + "/") || !body.storagePath.toLowerCase().endsWith(".m3u8")) {
        throw new ApiError(400, "STREAM_MANIFEST_PATH_INVALID", "The HLS manifest must be inside this asset's private streaming folder.");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.storage.from("bq-sqwad-streaming-media").createSignedUrl(body.storagePath, 60);
      if (error || !data?.signedUrl) throw new ApiError(404, "STREAM_MANIFEST_NOT_FOUND", "The private HLS manifest could not be found.");
      const response = await fetch(data.signedUrl, { headers: { Range: "bytes=0-2047" } });
      if (response.status !== 206) throw new ApiError(502, "STREAM_MANIFEST_RANGE_UNSUPPORTED", "Storage did not honor the bounded manifest inspection request.");
      const manifest = new TextDecoder().decode(await response.arrayBuffer());
      if (!manifest.replace(/^\uFEFF/, "").trimStart().startsWith("#EXTM3U")) {
        throw new ApiError(415, "STREAM_MANIFEST_INVALID", "The uploaded HLS manifest is invalid.");
      }
      const now = new Date().toISOString();
      await fs.patchDoc("contentAssets/" + params.assetId, {
        storagePath: body.storagePath, status: "ready", contentStatus: "draft",
        deliveryMode: "bq_hosted", readyAt: now, readyBy: user.uid, updatedAt: now,
      });") + "/a[1-9][0-9]*/master\\.m3u8$").test(body.storagePath) ||
          !destinationId) {
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
      await fs.patchDoc("contentAssets/" + params.assetId, {
        storagePath: body.storagePath, status: "processed_pending_review", contentStatus: "draft",
        deliveryMode: "bq_hosted", masterPlaylistValid: true,
        ownerReviewRequired: true, ownerReviewRequiredAt: now, updatedAt: now,
      });
      await writeAuditLog(fs, {
        actorUid: user.uid, action: "content.asset_submitted_for_review", targetType: "contentAsset", targetId: params.assetId,
        reason: body.reason, metadata: { channelId, deliveryMode: "bq_hosted" },
      });
      return Response.json({ assetId: params.assetId, status: "processed_pending_review", deliveryMode: "bq_hosted" });
    } catch (error) { return errorBody(error); }
  } } },
});
