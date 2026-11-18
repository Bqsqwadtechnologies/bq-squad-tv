import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/auth/devices/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const devices = await fs.query(`users/${user.uid}/sessions`);
          return Response.json({ items: devices });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
