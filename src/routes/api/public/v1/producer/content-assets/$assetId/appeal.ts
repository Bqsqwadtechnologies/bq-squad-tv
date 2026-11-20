import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  explanation: z.string().trim().min(10).max(2000),
  evidencePath: z.string().trim().max(1024).optional(),
});

export const Route = createFileRoute(
  "/api/public/v1/producer/content-assets/$assetId/appeal",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);

          if (!/^[A-Za-z0-9_-]{1,100}$/.test(params.assetId)) {
            throw new ApiError(400, "ASSET_ID_INVALID", "The asset id is invalid.");
          }

          const fs = await Firestore.create();
          const asset = await fs.getDoc("contentAssets/" + params.assetId);
          if (!asset) {
            throw new ApiError(404, "ASSET_NOT_FOUND", "The content asset was not found.");
          }

          // Verify ownership or channel access
          const ownerUid = (asset["ownerUid"] || asset["uploadedBy"]) as string;
          const channelId = asset["channelId"] as string | undefined;

          let isAuthorized = ownerUid === user.uid;
          if (!isAuthorized && channelId) {
            const channel = await fs.getDoc("channels/" + channelId);
            if (channel && channel["ownerUid"] === user.uid) {
              isAuthorized = true;
            }
          }

          if (!isAuthorized) {
            throw new ApiError(
              403,
              "FORBIDDEN",
              "You do not have permission to appeal decisions for this asset.",
            );
          }

          // Verify rejected status
          const isRejected =
            asset["status"] === "rejected" ||
            asset["rightsReviewStatus"] === "rejected" ||
            (asset["license"] as Record<string, unknown> | undefined)?.["status"] === "rejected";

          if (!isRejected) {
            throw new ApiError(
              400,
              "ASSET_NOT_REJECTED",
              "Only rejected uploads are eligible for appeal.",
            );
          }

          // Verify single-appeal limit
          if (asset["appealSubmitted"] === true) {
            throw new ApiError(
              409,
              "APPEAL_ALREADY_SUBMITTED",
              "This rejected upload has already been appealed once. Platform policy permits one appeal per asset.",
            );
          }

          const now = new Date().toISOString();
          await fs.patchDoc("contentAssets/" + params.assetId, {
            appealSubmitted: true,
            appealSubmittedAt: now,
            appealExplanation: body.explanation,
            appealEvidencePath: body.evidencePath || null,
            reviewQueueFlag: "Appealed by producer",
            rightsReviewStatus: "flagged",
            ownerReviewRequired: true,
            updatedAt: now,
          });

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "content.rights_appealed",
            targetType: "contentAsset",
            targetId: params.assetId,
            reason: body.explanation.slice(0, 500),
          });

          return Response.json({
            assetId: params.assetId,
            appealSubmitted: true,
            message: "Appeal submitted successfully and routed to rights review queue.",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
