import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/watchlist/$titleId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const titleId = params.titleId;
          const fs = await Firestore.create();
          await fs.deleteDoc(`users/${user.uid}/watchlist/${titleId}`);
          return Response.json({ removed: true, titleId });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
