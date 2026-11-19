import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { getConfiguredOwnerEmail } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export const Route = createFileRoute("/api/public/v1/provider/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const body = (await request.json().catch(() => ({}))) as {
            name?: string;
            contactEmail?: string;
            settlementCurrency?: string;
          };

          const callerEmail = (user.email || body.contactEmail || "").trim().toLowerCase();
          if (!callerEmail) {
            throw new ApiError(
              400,
              "EMAIL_REQUIRED",
              "A valid email address is required to register a provider.",
            );
          }

          const ownerEmail = getConfiguredOwnerEmail();
          const isOwner = Boolean(ownerEmail && callerEmail === ownerEmail);

          // Provider pre-approval check
          if (!isOwner) {
            const approvedDoc = await fs.getDoc(`approvedProviders/${callerEmail}`);
            const isApproved =
              approvedDoc &&
              (approvedDoc["status"] === "granted" || approvedDoc["status"] === "active");

            if (!isApproved) {
              await writeAuditLog(fs, {
                action: "provider_registration_rejected",
                actorUid: user.uid,
                targetType: "provider_approval",
                targetId: callerEmail,
                reason: "Email not on approved provider list",
                metadata: { email: callerEmail, requestedName: body.name },
              }).catch(() => undefined);

              return Response.json(
                {
                  code: "PROVIDER_ACCESS_DENIED",
                  message: "Access denied. Contact tv@bqsqwad.com to request provider access.",
                },
                { status: 403 },
              );
            }
          }

          const providerId = `prov_${Date.now()}`;
          const providerName = (body.name || callerEmail.split("@")[0] || "Channel Partner").trim();
          const settlementCurrency = (body.settlementCurrency || "NGN").toUpperCase();

          const providerRecord = {
            providerId,
            name: providerName,
            contactEmail: callerEmail,
            settlementCurrency,
            providerShareBps: 2500,
            status: "active",
            registeredByUid: user.uid,
            createdAt: new Date().toISOString(),
          };

          await fs.setDoc(`providers/${providerId}`, providerRecord);
          await fs.setDoc(`providerUsers/${user.uid}`, {
            uid: user.uid,
            providerId,
            status: "ACTIVE",
            assignedAt: new Date().toISOString(),
          });

          // Update user roles to include provider
          const existingUser = await fs.getDoc(`users/${user.uid}`);
          const currentRoles = Array.isArray(existingUser?.["roles"])
            ? (existingUser?.["roles"] as string[])
            : ["viewer"];
          const updatedRoles = Array.from(new Set([...currentRoles, "provider"]));
          await fs.setDoc(`users/${user.uid}`, {
            ...existingUser,
            roles: updatedRoles,
            providerId,
            updatedAt: new Date().toISOString(),
          });

          await writeAuditLog(fs, {
            action: "provider_registered",
            actorUid: user.uid,
            targetType: "provider",
            targetId: providerId,
            reason: isOwner
              ? "Registered via Zillionaire owner bypass"
              : "Registered via approved email whitelist",
            metadata: { email: callerEmail, providerName, settlementCurrency },
          });

          return Response.json(
            {
              ok: true,
              providerId,
              name: providerName,
              status: "active",
            },
            { status: 201 },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
