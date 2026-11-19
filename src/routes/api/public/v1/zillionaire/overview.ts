import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/overview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "overview");

          return Response.json({
            ...(access.isZillionaireOwner ? { controlCentre: "ZILLIONAIRE" } : {}),
            owner: access.isZillionaireOwner,
            emailVerified: access.emailVerified,
            producerPlanActive: access.producerPlanActive,
            modules: access.adminModules,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
