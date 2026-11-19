import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  featured: z.boolean(),
  featureRank: z.number().int().min(0).max(10_000).default(100),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/content-assets/$assetId/feature")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const assetId = params.assetId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId))
            throw new ApiError(400, "ASSET_ID_INVALID", "The content identifier is invalid.");
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "content");
          const asset = await fs.getDoc("contentAssets/" + assetId);
          if (!asset || asset["status"] !== "ready" || asset["contentStatus"] !== "published") {
            throw new ApiError(
              409,
              "CONTENT_NOT_PUBLISHABLE",
              "Only published, ready content can be featured.",
            );
          }
          const channelId = typeof asset["channelId"] === "string" ? asset["channelId"] : "";
          const channel = channelId ? await fs.getDoc("channels/" + channelId) : null;
          if (!channel || channel["published"] !== true)
            throw new ApiError(
              409,
              "CHANNEL_NOT_PUBLISHED",
              "The content's channel must be published before featuring it.",
            );
          const now = new Date().toISOString();
          await fs.patchDoc("contentAssets/" + assetId, {
            featured: body.featured,
            featureRank: body.featured ? body.featureRank : null,
            featuredAt: body.featured ? now : null,
            featuredBy: body.featured ? user.uid : null,
            updatedAt: now,
          });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: body.featured ? "content.featured" : "content.unfeatured",
            targetType: "contentAsset",
            targetId: assetId,
            reason: body.reason,
            metadata: { channelId, featureRank: body.featured ? body.featureRank : null },
          });
          return Response.json({
            assetId,
            featured: body.featured,
            featureRank: body.featured ? body.featureRank : null,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
