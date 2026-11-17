import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();

export const Route = createFileRoute("/api/public/v1/admin/content-assets/$assetId/publish")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      const assetId = params.assetId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) throw new ApiError(400, "ASSET_ID_INVALID", "The asset id is invalid.");
      const fs = await Firestore.create();
      await requireAdminModule(fs, user, "content");
      const asset = await fs.getDoc("contentAssets/" + assetId);
      if (!asset || asset["status"] !== "ready" || asset["masterPlaylistValid"] !== true ||
          asset["allSegmentsVerified"] !== true || asset["ownerReviewRequired"] === true) {
        throw new ApiError(409, "ASSET_NOT_READY_TO_PUBLISH", "This video must pass processing and review before publishing.");
      }
      const license = asset["license"] as Record<string, unknown> | undefined;
      if (license?.["status"] !== "verified" || license["verificationStatus"] !== "verified" ||
          license["commercialStreamingAllowed"] !== true) {
        throw new ApiError(403, "CONTENT_RIGHTS_NOT_VERIFIED", "Verified commercial streaming rights are required before publishing.");
      }
      const territories = license["territoryCodes"];
      if (!Array.isArray(territories) || territories.length === 0) {
        throw new ApiError(409, "CONTENT_TERRITORIES_REQUIRED", "At least one licensed viewing country is required.");
      }
      const now = new Date().toISOString();
      await fs.patchDoc("contentAssets/" + assetId, {
        contentStatus: "published",
        publishedAt: now,
        publishedBy: user.uid,
        publishReason: body.reason,
        updatedAt: now,
      });
      await writeAuditLog(fs, {
        actorUid: user.uid,
        action: "content.asset_published",
        targetType: "contentAsset",
        targetId: assetId,
        reason: body.reason,
        metadata: { territoryCount: territories.length },
      });
      return Response.json({ assetId, status: "ready", contentStatus: "published" });
    } catch (error) { return errorBody(error); }
  } } },
});
