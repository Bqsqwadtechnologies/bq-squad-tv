import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export const Route = createFileRoute("/api/public/v1/admin/providers/approved-emails")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireAdminModule(fs, user, "providers");

          const entries = await fs.query("approvedProviders", {
            orderByField: "updatedAt",
            descending: true,
            limit: 100,
          });

          return Response.json({
            approvedEmails: entries.map(doc => ({
              email: doc.__id || doc["email"],
              status: doc["status"] || "pending",
              addedAt: doc["addedAt"] || null,
              verifiedAt: doc["verifiedAt"] || null,
              grantedAt: doc["grantedAt"] || null,
              grantedBy: doc["grantedBy"] || null,
              notes: doc["notes"] || "",
              history: doc["history"] || [],
            })),
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireAdminModule(fs, user, "providers");

          const body = (await request.json().catch(() => ({}))) as {
            action?: "add" | "verify" | "grant" | "revoke" | "suspend";
            email?: string;
            notes?: string;
            reason?: string;
          };

          const rawEmail = (body.email || "").trim().toLowerCase();
          if (!rawEmail || !rawEmail.includes("@")) {
            throw new ApiError(400, "INVALID_EMAIL", "A valid email address is required.");
          }

          const action = body.action || "add";
          const now = new Date().toISOString();
          const docPath = `approvedProviders/${rawEmail}`;
          const existing = (await fs.getDoc(docPath)) || {};
          const history = Array.isArray(existing["history"]) ? [...existing["history"]] : [];

          history.push({
            action,
            actorUid: user.uid,
            timestamp: now,
            reason: body.reason || `Action: ${action}`,
          });

          let newStatus = existing["status"] || "pending";
          const updates: Record<string, unknown> = {
            email: rawEmail,
            notes: body.notes !== undefined ? body.notes : existing["notes"] || "",
            updatedAt: now,
            updatedBy: user.uid,
            history,
          };

          if (action === "add") {
            newStatus = "pending";
            updates["addedAt"] = existing["addedAt"] || now;
            updates["status"] = "pending";
          } else if (action === "verify") {
            newStatus = "verified";
            updates["verifiedAt"] = now;
            updates["status"] = "verified";
          } else if (action === "grant") {
            newStatus = "granted";
            updates["grantedAt"] = now;
            updates["grantedBy"] = user.uid;
            updates["status"] = "granted";
          } else if (action === "revoke") {
            newStatus = "revoked";
            updates["revokedAt"] = now;
            updates["revokedBy"] = user.uid;
            updates["status"] = "revoked";

            // Immediate revocation: kill any active provider sessions associated with this email
            const matchedUsers = await fs.query("users", {
              filters: [{ field: "email", op: "EQUAL", value: rawEmail }],
              limit: 5,
            });
            for (const u of matchedUsers) {
              const uid = u.__id || u["uid"];
              if (uid) {
                // Invalidate tokens / remove provider role
                const currentRoles = Array.isArray(u["roles"]) ? (u["roles"] as string[]).filter(r => r !== "provider") : ["viewer"];
                await fs.setDoc(`users/${uid}`, {
                  ...u,
                  roles: currentRoles,
                  providerRevokedAt: now,
                  sessionsRevokedAt: now,
                });
                await fs.setDoc(`providerUsers/${uid}`, {
                  status: "REVOKED",
                  revokedAt: now,
                  revokedBy: user.uid,
                });
              }
            }
          } else if (action === "suspend") {
            newStatus = "suspended";
            updates["suspendedAt"] = now;
            updates["status"] = "suspended";
          }

          await fs.setDoc(docPath, updates);

          await writeAuditLog(fs, {
            action: `provider_approval_${action}`,
            actorUid: user.uid,
            targetType: "provider_approval",
            targetId: rawEmail,
            reason: body.reason || `Provider email approval changed: ${action}`,
            metadata: { email: rawEmail, previousStatus: existing["status"] || "none", newStatus },
          });

          return Response.json({
            ok: true,
            email: rawEmail,
            status: newStatus,
            updatedAt: now,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
