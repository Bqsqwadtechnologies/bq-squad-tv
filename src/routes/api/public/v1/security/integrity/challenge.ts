import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/security/integrity/challenge")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const nonce = crypto.randomUUID();
          const fs = await Firestore.create();
          // One-use challenge: sessions/start marks the nonce used before issuing playback.
          await fs.setDoc(`integrityChallenges/${nonce}`, {
            uid: user.uid,
            used: false,
            createdAt: new Date().toISOString(),
          });
          return Response.json({ nonce });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
