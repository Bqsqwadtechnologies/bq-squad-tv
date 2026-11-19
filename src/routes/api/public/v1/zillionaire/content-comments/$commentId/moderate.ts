import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute(
  "/api/public/v1/zillionaire/content-comments/$commentId/moderate",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const reviewer = await requireUser(request);
          const body = await parseBody(request, schema);
          const commentId = params.commentId;
          if (!/^[A-Za-z0-9_-]{20,64}$/.test(commentId))
            throw new ApiError(400, "COMMENT_ID_INVALID", "The comment identifier is invalid.");
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, reviewer, "moderation");
          const comment = await fs.getDoc("contentComments/" + commentId);
          if (!comment || comment["status"] !== "PENDING") {
            throw new ApiError(
              404,
              "PENDING_COMMENT_NOT_FOUND",
              "This comment is not awaiting moderation.",
            );
          }
          if (comment["authorUid"] === reviewer.uid && body.approved) {
            throw new ApiError(
              403,
              "INDEPENDENT_REVIEW_REQUIRED",
              "A different moderator must approve this comment.",
            );
          }
          const now = new Date().toISOString();
          const status = body.approved ? "APPROVED" : "REJECTED";
          await fs.patchDoc("contentComments/" + commentId, {
            status,
            moderatedAt: now,
            moderatedBy: reviewer.uid,
            moderationReason: body.reason,
          });
          await writeAuditLog(fs, {
            actorUid: reviewer.uid,
            action: body.approved ? "content.comment_approved" : "content.comment_rejected",
            targetType: "contentComment",
            targetId: commentId,
            reason: body.reason,
            metadata: { assetId: comment["assetId"] ?? null },
          });
          return Response.json({ commentId, status, moderatedAt: now });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
