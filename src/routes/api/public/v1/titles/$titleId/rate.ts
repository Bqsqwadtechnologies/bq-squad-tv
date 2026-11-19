import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const schema = z
  .object({
    rating: z.number().int().min(1).max(5),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/titles/$titleId/rate")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const titleId = params.titleId;
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();

          // Verify user has actually watched this title (ledger or resume position exists)
          const resume = await fs.getDoc(`users/${user.uid}/resumePositions/${titleId}`);
          if (!resume) {
            throw new ApiError(403, "WATCH_REQUIRED", "You can only rate titles you have watched.");
          }

          const now = new Date().toISOString();
          await fs.setDoc(`titleRatings/${titleId}_${user.uid}`, {
            titleId,
            uid: user.uid,
            rating: body.rating,
            createdAt: now,
          });

          return Response.json({ rated: true, titleId, rating: body.rating });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
