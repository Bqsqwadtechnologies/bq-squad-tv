import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { resolveProducerBySlugOrId } from "@/lib/server/producer-profile";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const reportSchema = z.object({
  reason: z.string().trim().min(3, "Please provide a reason for the report").max(300),
});

export const Route = createFileRoute("/api/public/v1/producers/$slug/comments/$commentId/report")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, reportSchema);
          const fs = await Firestore.create();
          const { uid: producerUid } = await resolveProducerBySlugOrId(fs, params.slug);

          await enforceRateLimit(fs, "report-comment:" + user.uid, {
            limit: 10,
            windowMs: 60 * 60_000,
          });

          const commentPath = `producers/${producerUid}/comments/${params.commentId}`;
          const comment = await fs.getDoc(commentPath);

          if (!comment) {
            throw new ApiError(404, "COMMENT_NOT_FOUND", "Comment not found.");
          }

          const reportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const now = new Date().toISOString();

          await fs.setDoc(`commentReports/${reportId}`, {
            id: reportId,
            commentId: params.commentId,
            producerUid,
            reportedByUid: user.uid,
            reason: body.reason,
            commentBody: comment["body"] || "",
            status: "pending_review",
            createdAt: now,
          });

          await fs.patchDoc(commentPath, {
            flagged: true,
            reportCount: (Number(comment["reportCount"]) || 0) + 1,
            lastReportedAt: now,
          });

          return Response.json({
            success: true,
            message: "Comment reported for review.",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
