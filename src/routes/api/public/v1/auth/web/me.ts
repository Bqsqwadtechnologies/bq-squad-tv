import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireViewer } from "@/lib/server/access";
import { getConfiguredOwnerEmail } from "@/lib/server/roles";
import { ensureAccountId } from "@/lib/server/account-id";
import { ensurePublicId, type PublicIdType } from "@/lib/server/universal-ids";
import { Firestore } from "@/lib/server/firebase-admin";

export const Route = createFileRoute("/api/public/v1/auth/web/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user, access } = await requireViewer(request);
          if (!user.emailVerified) {
            return Response.json(
              { email: user.email, emailVerified: false },
              { headers: { "cache-control": "no-store", pragma: "no-cache" } },
            );
          }
          const fs = await Firestore.create();
          const profile = await fs.getDoc("users/" + user.uid);
          const accountId = await ensureAccountId(fs, user.uid, profile);
          const userType: PublicIdType = access.isZillionaireOwner ? "zillionaire" : "viewer";
          const publicId = await ensurePublicId(
            fs,
            user.uid,
            userType,
            typeof profile?.["publicId"] === "string" ? profile["publicId"] : null,
          );
          const wallet = await fs.getDoc("wallets/" + user.uid);
          return Response.json(
            {
              uid: user.uid,
              accountId,
              publicId,
              countryCode: profile?.["countryCode"] ?? null,
              currency: wallet?.["currency"] ?? profile?.["preferredCurrency"] ?? null,
              email: user.email,
              emailVerified: access.emailVerified,
              roles: access.roles,
              isOwner: access.isZillionaireOwner,
              needsOwnerVerification: access.needsOwnerVerification,
              modules: access.adminModules,
              producerPlanActive: access.producerPlanActive,
              providerId: access.providerId ?? null,
              ...(access.isZillionaireOwner
                ? {
                    diagnostics: {
                      ownerSecretConfigured: Boolean(getConfiguredOwnerEmail()),
                    },
                  }
                : {}),
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
