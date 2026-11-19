import { createFileRoute } from "@tanstack/react-router";
import { Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export const Route = createFileRoute("/api/public/v1/auth/session/revoke-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await enforceRateLimit(fs, "session-revoke-all:" + user.uid, {
            limit: 3,
            windowMs: 15 * 60_000,
          });
          const profilePath = "users/" + user.uid;
          const auditId = crypto.randomUUID();
          const auditPath = "auditLog/" + auditId;
          const nowSeconds = Math.floor(Date.now() / 1000);
          const now = new Date(nowSeconds * 1000).toISOString();
          await fs.transact([profilePath, auditPath], ([profile, existingAudit]) => {
            if (existingAudit)
              throw new Error("Could not create the session revocation audit record.");
            const previous =
              typeof profile?.["sessionsRevokedAfter"] === "number"
                ? (profile["sessionsRevokedAfter"] as number)
                : null;
            return {
              result: undefined,
              writes: [
                {
                  update: {
                    name: fs.docName(profilePath),
                    fields: encodeFields({
                      sessionsRevokedAfter: nowSeconds,
                      sessionsRevokedAt: now,
                    }),
                  },
                  updateMask: { fieldPaths: ["sessionsRevokedAfter", "sessionsRevokedAt"] },
                },
                {
                  update: {
                    name: fs.docName(auditPath),
                    fields: encodeFields({
                      actorUid: user.uid,
                      action: "auth.sessions_revoked",
                      targetType: "user",
                      targetId: user.uid,
                      reason: "User requested sign-out from all devices.",
                      before: { sessionsRevokedAfter: previous },
                      after: { sessionsRevokedAfter: nowSeconds },
                      createdAt: now,
                    }),
                  },
                  currentDocument: { exists: false },
                },
              ],
            };
          });
          return Response.json(
            { revoked: true, reauthenticationRequired: true },
            { headers: { "cache-control": "no-store", pragma: "no-cache" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
