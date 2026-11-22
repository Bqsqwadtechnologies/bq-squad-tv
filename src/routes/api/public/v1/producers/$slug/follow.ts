import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore, ApiError, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { resolveProducerBySlugOrId } from "@/lib/server/producer-profile";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { parseBody } from "@/lib/server/api";

const followSchema = z.object({ following: z.boolean() });

export const Route = createFileRoute("/api/public/v1/producers/$slug/follow")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const { uid: producerUid } = await resolveProducerBySlugOrId(fs, params.slug);
          const { following: requestedFollowing } = await parseBody(request, followSchema);

          if (user.uid === producerUid) {
            throw new ApiError(400, "CANNOT_FOLLOW_SELF", "You cannot follow your own producer profile.");
          }

          await enforceRateLimit(fs, "follow-producer:" + user.uid, {
            limit: 40,
            windowMs: 60 * 60_000,
          });

          const followPath = `producers/${producerUid}/followers/${user.uid}`;
          const producerPath = `producers/${producerUid}`;
          const now = new Date().toISOString();
          const outcome = await fs.transact([producerPath, followPath], ([producer, existingFollow]) => {
            if (!producer) throw new ApiError(404, "PRODUCER_NOT_FOUND", "This producer profile is unavailable.");
            const wasFollowing = existingFollow?.["active"] === true;
            const currentCount = Math.max(0, Number(producer["followerCount"]) || 0);
            if (wasFollowing === requestedFollowing) {
              return { result: { isFollowing: wasFollowing, followerCount: currentCount, changed: false }, writes: [] };
            }
            const nextCount = Math.max(0, currentCount + (requestedFollowing ? 1 : -1));
            const followFields = requestedFollowing
              ? { uid: user.uid, active: true, followedAt: now }
              : { uid: user.uid, active: false, unfollowedAt: now };
            return {
              result: { isFollowing: requestedFollowing, followerCount: nextCount, changed: true },
              writes: [
                {
                  update: { name: fs.docName(followPath), fields: encodeFields(followFields) },
                  updateMask: { fieldPaths: Object.keys(followFields) },
                  currentDocument: { exists: Boolean(existingFollow) },
                },
                {
                  update: { name: fs.docName(producerPath), fields: encodeFields({ followerCount: nextCount, updatedAt: now }) },
                  updateMask: { fieldPaths: ["followerCount", "updatedAt"] },
                  currentDocument: { exists: true },
                },
              ],
            };
          });

          if (outcome.changed && outcome.isFollowing) {
            const viewerDoc = await fs.getDoc(`users/${user.uid}`);
            const viewerName = viewerDoc?.["displayName"] || "A viewer";
            const notifId = `notif_${crypto.randomUUID().replace(/-/g, "")}`;
            await fs.setDoc(`users/${producerUid}/notifications/${notifId}`, {
              id: notifId,
              title: "New Follower",
              body: `${viewerName} is now following your producer profile!`,
              deepLink: `/p/${params.slug}`,
              read: false,
              createdAt: now,
            }).catch(() => {});
          }

          return Response.json({
            success: true,
            isFollowing: outcome.isFollowing,
            followerCount: outcome.followerCount,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
