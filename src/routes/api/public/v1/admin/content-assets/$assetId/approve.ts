import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } from "@/lib/server/storage/registry";
import { createStorageProviderAdapter } from "@/lib/server/storage/providers";
import { validateContentApprovalRequirements } from "@/lib/server/content-review";
import { writeAuditLog } from "@/lib/server/audit";
import { isSafeStoragePath } from "@/lib/server/storage/security";

const schema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();

export const Route = createFileRoute("/api/public/v1/admin/content-assets/$assetId/approve")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      const assetId = params.assetId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) throw new ApiError(400, "ASSET_ID_INVALID", "The asset id is invalid.");
      if (!Number.isSafeInteger(user.authTime) || Math.floor(Date.now() / 1000) - user.authTime > 300) {
        throw new ApiError(403, "RECENT_SIGN_IN_REQUIRED", "Sign in again before approving processed content.");
      }
      const fs = await Firestore.create();
      await requireAdminModule(fs, user, "content");
      const asset = await fs.getDoc("contentAssets/" + assetId);
      if (!asset) throw new ApiError(404, "ASSET_NOT_FOUND", "The video could not be found.");
      const review = validateContentApprovalRequirements(asset);
      const { posterKey, ageRating, territoryCount } = review;
      const destinationId = typeof asset["posterDestinationId"] === "string"
        ? asset["posterDestinationId"]
        : typeof asset["streamDestinationId"] === "string" ? asset["streamDestinationId"] : "";
      if (!posterKey || !isSafeStoragePath(posterKey) || !destinationId) {
        throw new ApiError(409, "CONTENT_POSTER_REQUIRED", "A verified poster image is required before approval.");
      }
      const rawDestination = await fs.getDoc("storageDestinations/" + destinationId);
      if (!rawDestination) throw new ApiError(503, "HLS_DESTINATION_MISSING", "The assigned storage location is unavailable.");
      const metadata = validateStorageDestinationMetadata({ ...rawDestination, destinationId });
      const config = resolveStorageDestinationConfiguration(metadata);
      if (config.configurationStatus !== "configured") throw new ApiError(503, "HLS_DESTINATION_MISCONFIGURED", "The assigned storage location is not configured.");
      const adapter = createStorageProviderAdapter(config);
      const poster = await adapter.headObject(posterKey);
      if (!poster || poster.sizeBytes <= 0 || !poster.contentType?.startsWith("image/")) {
        throw new ApiError(409, "CONTENT_POSTER_INVALID", "The poster image could not be verified.");
      }
      const now = new Date().toISOString();
      await fs.patchDoc("contentAssets/" + assetId, {
        status: "ready",
        ownerReviewRequired: false,
        approvedAt: now,
        approvedBy: user.uid,
        approvalReason: body.reason,
        updatedAt: now,
      });
      await writeAuditLog(fs, {
        actorUid: user.uid,
        action: "content.asset_approved",
        targetType: "contentAsset",
        targetId: assetId,
        reason: body.reason,
        metadata: { destinationId, ageRating, territoryCount, uploadedObjectCount: asset["uploadedObjectCount"] },
      });
      return Response.json({ assetId, status: "ready", published: false });
    } catch (error) { return errorBody(error); }
  } } },
});
