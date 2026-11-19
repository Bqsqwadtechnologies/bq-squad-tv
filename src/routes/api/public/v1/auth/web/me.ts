import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireViewer } from "@/lib/server/access";
import { getConfiguredOwnerEmail } from "@/lib/server/roles";

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
              needsOwnerVerification: access.needsOwnerVerification,
              modules: access.adminModules,
              producerPlanActive: access.producerPlanActive,
              providerId: access.providerId ?? null,
              ...(access.isZillionaireOwner ? {
                diagnostics: {
                  ownerSecretConfigured: Boolean(getConfiguredOwnerEmail()),
                },
              } : {}),
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
