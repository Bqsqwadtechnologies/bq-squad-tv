import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { getKycDraft, saveKycDraft, deleteKycDraft } from "@/lib/server/kyc/persistence";

export const Route = createFileRoute("/api/public/v1/producer/verification/draft")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const draft = await getKycDraft(fs, user.uid);
          return Response.json({ draft });
        } catch (error) {
          return errorBody(error);
        }
      },

      PUT: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const fs = await Firestore.create();
          await saveKycDraft(fs, user.uid, body);
          return Response.json({ ok: true, savedAt: new Date().toISOString() });
        } catch (error) {
          return errorBody(error);
        }
      },

      DELETE: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await deleteKycDraft(fs, user.uid);
          return Response.json({ ok: true });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
