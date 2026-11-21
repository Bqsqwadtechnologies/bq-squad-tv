import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { scanAndProcessDocumentExpiries } from "@/lib/server/kyc/lifecycle";

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/lifecycle/scan-expiries")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          // Compliance or security access required
          await requireZillionaireModule(fs, user, "compliance");

          const result = await scanAndProcessDocumentExpiries(fs);

          return Response.json({
            ok: true,
            summary: result,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
