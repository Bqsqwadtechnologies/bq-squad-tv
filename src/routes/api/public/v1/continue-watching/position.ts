import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireVerifiedViewer } from "@/lib/server/access";

const schema = z
  .object({
    titleId: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(200),
    positionSeconds: z.number().int().min(0),
    durationSeconds: z.number().int().min(1),
    posterUrl: z.string().url().optional(),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/continue-watching/position")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { user } = await requireVerifiedViewer(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          const now = new Date().toISOString();

          // If watched >= 95% of duration, consider completed and clear position
          if (body.positionSeconds / body.durationSeconds >= 0.95) {
            await fs.deleteDoc(`users/${user.uid}/resumePositions/${body.titleId}`);
            return Response.json({ cleared: true, titleId: body.titleId });
          }

          await fs.setDoc(`users/${user.uid}/resumePositions/${body.titleId}`, {
            titleId: body.titleId,
            title: body.title,
            positionSeconds: body.positionSeconds,
            durationSeconds: body.durationSeconds,
            posterUrl: body.posterUrl ?? "",
            updatedAt: now,
          });

          return Response.json({ saved: true, titleId: body.titleId });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
