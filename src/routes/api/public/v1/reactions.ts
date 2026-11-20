import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const reactionSchema = z.object({
  targetType: z.enum(["video", "episode", "channel", "live_stream"]),
  targetId: z.string().trim().min(1),
  reaction: z.enum(["like", "dislike", "none"]),
  title: z.string().trim().optional(),
  posterUrl: z.string().nullable().optional(),
});

export const Route = createFileRoute("/api/public/v1/reactions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const targetType = url.searchParams.get("targetType");
          const targetId = url.searchParams.get("targetId");

          if (!targetType || !targetId) {
            throw new ApiError(400, "MISSING_PARAMS", "targetType and targetId are required.");
          }

          const fs = await Firestore.create();
          const summaryKey = `reactions_summary/${targetType}_${targetId}`;
          const summaryDoc = await fs.getDoc(summaryKey).catch(() => null);

          const likeCount = typeof summaryDoc?.["likeCount"] === "number" ? summaryDoc["likeCount"] : 0;
          const dislikeCount = typeof summaryDoc?.["dislikeCount"] === "number" ? summaryDoc["dislikeCount"] : 0;

          let userReaction: "like" | "dislike" | null = null;
          const authHeader = request.headers.get("authorization");
          if (authHeader) {
            try {
              const user = await requireUser(request);
              const userVoteDoc = await fs.getDoc(`reactions/${targetType}_${targetId}_${user.uid}`);
              if (userVoteDoc?.["reaction"] === "like" || userVoteDoc?.["reaction"] === "dislike") {
                userReaction = userVoteDoc["reaction"] as "like" | "dislike";
              }
            } catch {
              // Anonymous viewer is fine
            }
          }

          return Response.json({
            targetType,
            targetId,
            likeCount,
            dislikeCount,
            userReaction,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, reactionSchema);
          const fs = await Firestore.create();

          const voteKey = `reactions/${body.targetType}_${body.targetId}_${user.uid}`;
          const summaryKey = `reactions_summary/${body.targetType}_${body.targetId}`;
          const likedItemKey = `users/${user.uid}/liked_items/${body.targetType}_${body.targetId}`;

          const existingVoteDoc = await fs.getDoc(voteKey);
          const previousReaction = (existingVoteDoc?.["reaction"] || "none") as "like" | "dislike" | "none";

          let deltaLikes = 0;
          let deltaDislikes = 0;

          if (previousReaction === "like") deltaLikes -= 1;
          if (previousReaction === "dislike") deltaDislikes -= 1;

          if (body.reaction === "like") deltaLikes += 1;
          if (body.reaction === "dislike") deltaDislikes += 1;

          const now = new Date().toISOString();

          // Update user vote
          if (body.reaction === "none") {
            await fs.patchDoc(voteKey, { reaction: "none", updatedAt: now });
            // Remove from liked library
            await fs.patchDoc(likedItemKey, { active: false, unlikedAt: now }).catch(() => null);
          } else {
            await fs.setDoc(voteKey, {
              uid: user.uid,
              targetType: body.targetType,
              targetId: body.targetId,
              reaction: body.reaction,
              updatedAt: now,
            });

            if (body.reaction === "like") {
              // Add to liked library
              await fs.setDoc(likedItemKey, {
                id: `${body.targetType}_${body.targetId}`,
                targetType: body.targetType,
                targetId: body.targetId,
                title: body.title || `${body.targetType} ${body.targetId}`,
                posterUrl: body.posterUrl || null,
                active: true,
                likedAt: now,
              });
            } else {
              // Disliked: remove from liked library
              await fs.patchDoc(likedItemKey, { active: false, unlikedAt: now }).catch(() => null);
            }
          }

          // Update summary counters
          const summaryDoc = await fs.getDoc(summaryKey);
          const currentLikes = typeof summaryDoc?.["likeCount"] === "number" ? summaryDoc["likeCount"] : 0;
          const currentDislikes = typeof summaryDoc?.["dislikeCount"] === "number" ? summaryDoc["dislikeCount"] : 0;

          const newLikes = Math.max(0, currentLikes + deltaLikes);
          const newDislikes = Math.max(0, currentDislikes + deltaDislikes);

          await fs.setDoc(summaryKey, {
            targetType: body.targetType,
            targetId: body.targetId,
            likeCount: newLikes,
            dislikeCount: newDislikes,
            updatedAt: now,
          });

          return Response.json({
            success: true,
            targetType: body.targetType,
            targetId: body.targetId,
            likeCount: newLikes,
            dislikeCount: newDislikes,
            userReaction: body.reaction === "none" ? null : body.reaction,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
