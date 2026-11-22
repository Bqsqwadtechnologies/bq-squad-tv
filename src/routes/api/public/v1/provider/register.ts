import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { getConfiguredOwnerEmail } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export const Route = createFileRoute("/api/public/v1/provider/register")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const providerUser = await fs.getDoc(`providerUsers/${user.uid}`);
          if (!providerUser) {
            return Response.json({ registered: false, status: "unregistered" });
          }

          const providerDoc = await fs.getDoc(`providers/${providerUser["providerId"]}`);
          return Response.json({
            registered: true,
            providerId: providerUser["providerId"],
            provider: providerDoc,
            status: providerDoc?.["status"] || "pending_approval",
            sandboxCredentials: providerDoc?.["sandboxCredentials"] || null,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async () => {
        return Response.json(
          {
            error: "REGISTRATION_RESTRICTED",
            message: "Channels are created by us for approved partners. To partner with us, contact tv@bqsqwad.com.",
          },
          { status: 403, headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
