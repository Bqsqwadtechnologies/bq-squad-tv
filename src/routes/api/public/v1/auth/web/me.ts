import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireViewer } from "@/lib/server/access";

export const Route = createFileRoute("/api/public/v1/auth/web/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user, access } = await requireViewer(request);
          return Response.json(
            {
              uid: user.uid,
              email: user.email,
              emailVerified: access.emailVerified,
              roles: access.roles,
              isOwner: access.isZillionaireOwner,
              modules: access.adminModules,
              producerPlanActive: access.producerPlanActive,
              providerId: access.providerId ?? null,
            },
            { headers: { "cache-control": "no-store", pragma: "no-cache" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
