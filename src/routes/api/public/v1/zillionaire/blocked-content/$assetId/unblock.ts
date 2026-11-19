import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

const unblockSchema = z
  .object({
    reason: z.string().trim().min(3).max(1000).default("Owner review: unblocked and restored to catalogue."),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/zillionaire/blocked-content/$assetId/unblock")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const assetId = params.assetId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) {
            throw new ApiError(400, "ASSET_ID_INVALID", "Invalid asset identifier.");
          }
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "moderation");

          const asset = await fs.get(`contentAssets/${assetId}`);
          if (!asset) {
            throw new ApiError(404, "ASSET_NOT_FOUND", "Content asset not found.");
          }

          const body = await parseBody(request, unblockSchema);
          const now = new Date().toISOString();
          const auditId = crypto.randomUUID();

          await fs.set(`contentAssets/${assetId}`, {
            ...asset,
            status: "ready",
            contentStatus: "unpublished",
            blockedAt: null,
            blockedBy: null,
            blockedReason: null,
            unblockedAt: now,
            unblockedBy: actor.uid,
            unblockReason: body.reason,
            updatedAt: now,
          });

          await fs.set(`auditLog/${auditId}`, {
            actorUid: actor.uid,
            action: "content.unblocked",
            targetId: assetId,
            reason: body.reason,
            createdAt: now,
          });

          return Response.json({
            success: true,
            assetId,
            status: "ready",
            contentStatus: "unpublished",
            unblockedAt: now,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
