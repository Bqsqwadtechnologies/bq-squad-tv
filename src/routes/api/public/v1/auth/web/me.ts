import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireViewer } from "@/lib/server/access";
import { getConfiguredOwnerEmail } from "@/lib/server/roles";
import { ensureAccountId } from "@/lib/server/account-id";
import { ensurePublicId, type PublicIdType } from "@/lib/server/universal-ids";
import { Firestore } from "@/lib/server/firebase-admin";
import { detectCountryFromRequest } from "@/lib/server/country-detection";
import { currencyForCountry } from "@/lib/server/currency";

export const Route = createFileRoute("/api/public/v1/auth/web/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user, access } = await requireViewer(request);
          if (!user.emailVerified) {
            // Keep the authenticated account visible to the UI while it is
            // waiting for email verification; privileged access remains denied.
            return Response.json(
              {
                uid: user.uid,
                email: user.email,
                emailVerified: false,
                roles: access.roles,
                isOwner: access.isZillionaireOwner,
                needsOwnerVerification: access.needsOwnerVerification,
                modules: access.adminModules,
                producerPlanActive: access.producerPlanActive,
                providerId: access.providerId ?? null,
              },
              { headers: { "cache-control": "no-store", pragma: "no-cache" } },
            );
          }
          const fs = await Firestore.create();
          let profile = await fs.getDoc("users/" + user.uid);
          const detectedCountry = await detectCountryFromRequest(request);
          if (!profile) {
            const now = new Date().toISOString();
            profile = {
              email: user.email ?? "",
              role: "viewer",
              roles: ["viewer"],
              countryCode: detectedCountry,
              preferredCurrency: detectedCountry ? currencyForCountry(detectedCountry) : null,
              countryDetectionSource: detectedCountry ? "ip" : "unknown",
              countryDetectedAt: detectedCountry ? now : null,
              profileComplete: false,
              createdAt: now,
              updatedAt: now,
            };
            await fs.setDoc("users/" + user.uid, profile, { merge: true });
          } else if (detectedCountry && profile["countryCode"] !== detectedCountry) {
            const now = new Date().toISOString();
            await fs.setDoc("users/" + user.uid, {
              countryCode: detectedCountry,
              preferredCurrency: currencyForCountry(detectedCountry),
              countryDetectionSource: "ip",
              countryDetectedAt: now,
              updatedAt: now,
            }, { merge: true });
            profile = { ...profile, countryCode: detectedCountry, preferredCurrency: currencyForCountry(detectedCountry) };
          }
          const accountId = await ensureAccountId(fs, user.uid, profile);
          let userType: PublicIdType = "viewer";
          if (access.isZillionaireOwner) {
            userType = "zillionaire";
          } else if (access.roles.includes("producer")) {
            userType = "producer";
          } else if (access.roles.includes("provider") || access.providerId) {
            userType = "provider";
          }

          const publicId = await ensurePublicId(
            fs,
            user.uid,
            userType,
            typeof profile?.["publicId"] === "string" ? profile["publicId"] : null,
          );

          // Provider invitations require explicit approval and a secure acceptance flow.
          // Merely signing in with a matching email must never grant provider access.
          let wallet = await fs.getDoc("wallets/" + user.uid);
          if (!wallet) {
            const currency = detectedCountry
              ? currencyForCountry(detectedCountry)
              : (typeof profile?.["preferredCurrency"] === "string" ? profile["preferredCurrency"] as string : "USD");
            await fs.setDoc("wallets/" + user.uid, {
              balanceMinor: 0,
              currency,
              dailySpendLimitMinor: null,
              spentTodayMinor: 0,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
            wallet = await fs.getDoc("wallets/" + user.uid);
          }
          return Response.json(
            {
              uid: user.uid,
              accountId,
              publicId,
              countryCode: profile?.["countryCode"] ?? detectedCountry ?? null,
              profileComplete: profile?.["profileComplete"] === true,
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
