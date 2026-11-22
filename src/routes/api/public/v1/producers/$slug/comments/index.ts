import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { resolveProducerBySlugOrId } from "@/lib/server/producer-profile";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const commentSchema = z.object({
  body: z.string().trim().min(2, "Comment must be at least 2 characters").max(500, "Comment cannot exceed 500 characters"),
});

export const Route = createFileRoute("/api/public/v1/producers/$slug/comments/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const fs = await Firestore.create();
          const { uid: producerUid } = await resolveProducerBySlugOrId(fs, params.slug);

          const comments = await fs.query(`producers/${producerUid}/comments`, {
            orderByField: "createdAt",
            descending: true,
            limit: 50,
          });

          // Only explicitly approved comments are public. Pending, flagged, and legacy-active
          // records stay private until a moderator approves them.
          const visible = comments
            .filter((c) => c["status"] === "approved")
            .map((c) => ({
              id: c.__id || c["id"],
              authorName: c["authorName"] || "Community Viewer",
              authorAvatar: c["authorAvatar"] || null,
              body: c["body"] || "",
              createdAt: c["createdAt"] || null,
              flagged: c["flagged"] === true,
            }));

          return Response.json({
            comments: visible,
            totalCount: visible.length,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, commentSchema);
          const fs = await Firestore.create();
          const { uid: producerUid } = await resolveProducerBySlugOrId(fs, params.slug);

          await enforceRateLimit(fs, "comment-producer:" + user.uid, {
            limit: 15,
            windowMs: 60 * 60_000,
          });

          const userDoc = await fs.getDoc(`users/${user.uid}`);
          const authorName = (userDoc?.["displayName"] as string) || (userDoc?.["name"] as string) || "Viewer";
          const authorAvatar = (userDoc?.["photoURL"] as string) || null;

          const commentId = `comment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const now = new Date().toISOString();

          const commentDoc = {
            id: commentId,
            authorUid: user.uid,
            authorName,
            authorAvatar,
            body: body.body,
            status: "pending_review",
            flagged: false,
            createdAt: now,
          };

          await fs.setDoc(`producers/${producerUid}/comments/${commentId}`, commentDoc);

          return Response.json({ success: true, status: "pending_review", message: "Your comment was submitted for review." }, { status: 201 });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
