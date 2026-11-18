import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/auth/devices/signout-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const now = new Date().toISOString();

          // Bump minimum valid authTime to revoke all existing sessions
          await fs.setDoc(`users/${user.uid}/sessionRevocation`, {
            revokedBeforeAuthTime: Math.floor(Date.now() / 1000),
            revokedAt: now,
          });

          return Response.json({ signedOutAll: true });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
