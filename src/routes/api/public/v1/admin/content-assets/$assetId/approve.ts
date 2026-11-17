import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } from "@/lib/server/storage/registry";
import { createStorageProviderAdapter } from "@/lib/server/storage/providers";
import { isSafeStoragePath } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";

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
      if (!asset || asset["status"] !== "processed_pending_review") {
        throw new ApiError(409, "ASSET_NOT_AWAITING_REVIEW", "This video is not waiting for review.");
      }
      const license = asset["license"] as Record<string, unknown> | undefined;
      if (license?.["status"] !== "verified" || license["verificationStatus"] !== "verified") {
        throw new ApiError(403, "CONTENT_RIGHTS_NOT_VERIFIED", "Verified distribution rights are required.");
      }
      const rawAssetTerritories = asset["territoryCodes"] ?? asset["territories"];
      const assetTerritories = Array.isArray(rawAssetTerritories)
        ? rawAssetTerritories.filter((value): value is string => typeof value === "string").map(value => value.trim().toUpperCase())
        : [];
      const rightsTerritories = Array.isArray(license["territoryCodes"])
        ? license["territoryCodes"].filter((value): value is string => typeof value === "string").map(value => value.trim().toUpperCase())
        : [];
      if (!assetTerritories.length || !rightsTerritories.length ||
          assetTerritories.some(territory => !rightsTerritories.includes(territory))) {
        throw new ApiError(409, "CONTENT_TERRITORY_INVALID", "The video's viewing countries do not match the verified rights.");
      }
      const ageRating = typeof asset["ageRating"] === "string" ? asset["ageRating"].trim().toUpperCase() : "";
      if (!["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA", "G", "PG", "PG-13", "12", "12A", "15", "16", "18", "R", "NC-17"].includes(ageRating)) {
        throw new ApiError(409, "CONTENT_AGE_RATING_REQUIRED", "Choose a valid age rating before approval.");
      }
      const posterKey = typeof asset["posterObjectKey"] === "string"
        ? asset["posterObjectKey"]
        : typeof asset["posterPath"] === "string" ? asset["posterPath"] : "";
      const destinationId = typeof asset["streamDestinationId"] === "string" ? asset["streamDestinationId"] : "";
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
      const expected = typeof asset["expectedObjectCount"] === "number" ? asset["expectedObjectCount"] : 0;
      const uploaded = typeof asset["uploadedObjectCount"] === "number" ? asset["uploadedObjectCount"] : 0;
      if (asset["masterPlaylistValid"] !== true || asset["allSegmentsVerified"] !== true ||
          expected < 2 || uploaded !== expected || asset["hlsVerifiedAt"] == null) {
        throw new ApiError(409, "CONTENT_PROCESSING_CHECKS_FAILED", "The processed video has not passed every file and playlist check.");
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
        metadata: { destinationId, ageRating, territoryCount: assetTerritories.length, uploadedObjectCount: uploaded },
      });
      return Response.json({ assetId, status: "ready", published: false });
    } catch (error) { return errorBody(error); }
  } } },
});
