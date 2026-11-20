import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const commentReportSchema = z.object({
  commentId: z.string().trim().min(1),
  assetId: z.string().trim().min(1),
  reason: z.enum(["harassment", "hate_speech", "spam", "inappropriate", "spoiler", "other"]),
  details: z.string().trim().max(1000).optional(),
});

export const Route = createFileRoute("/api/public/v1/comment-reports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, commentReportSchema);
          const fs = await Firestore.create();

          const reportId = `rep_cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const now = new Date().toISOString();

          await fs.setDoc(`comment_reports/${reportId}`, {
            id: reportId,
            commentId: body.commentId,
            assetId: body.assetId,
            reason: body.reason,
            details: body.details || "",
            reporterUid: user.uid,
            status: "pending_review",
            createdAt: now,
          });

          // Increment flag counter on comment
          const commentKey = `content_comments/${body.commentId}`;
          const commentDoc = await fs.getDoc(commentKey).catch(() => null);
          if (commentDoc) {
            const currentFlags = typeof commentDoc["flagCount"] === "number" ? commentDoc["flagCount"] : 0;
            await fs.patchDoc(commentKey, {
              flagCount: currentFlags + 1,
              lastFlaggedAt: now,
              moderationStatus: currentFlags + 1 >= 3 ? "flagged" : commentDoc["moderationStatus"] || "approved",
            });
          }

          return Response.json({
            success: true,
            reportId,
            message: "Comment reported. Thank you for helping keep the community safe.",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
