import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { createPrivatePreviewGrant } from "@/lib/server/preview-grants";

const schema = z
  .object({
    targetType: z.enum(["asset", "channel"]),
    targetId: z.string().min(1).max(120),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/preview/grant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();

          const grant = await createPrivatePreviewGrant(fs, user, body.targetType, body.targetId);

          return Response.json({
            success: true,
            ...grant,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
