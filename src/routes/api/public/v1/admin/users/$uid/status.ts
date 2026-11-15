import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { isProtectedSuperAdmin, requireAdminModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/admin/users/$uid/status")({
  server: { handlers: {
    PATCH: async ({ request, params }) => {
      try {
        const actor = await requireUser(request);
        const uid = params.uid;
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
          throw new ApiError(400, "USER_ID_INVALID", "The target user identifier is invalid.");
        }
        if (uid === actor.uid) {
          throw new ApiError(403, "SELF_SUSPENSION_BLOCKED", "You cannot change your own account status.");
        }
        const body = await parseBody(request, schema);
        const fs = await Firestore.create();
        await requireAdminModule(fs, actor, "users");
        await enforceRateLimit(fs, "platform-account-status:" + actor.uid, { limit: 20, windowMs: 60_000 });

        const targetPath = "users/" + uid;
        const auditId = crypto.randomUUID();
        const auditPath = "auditLog/" + auditId;
        const now = new Date().toISOString();
        const result = await fs.transact([targetPath, auditPath], ([target, existingAudit]) => {
          if (!target) throw new ApiError(404, "USER_NOT_FOUND", "The target user profile does not exist.");
          if (existingAudit) throw new ApiError(409, "AUDIT_ID_CONFLICT", "Could not record the account status change.");
          const targetEmail = typeof target["email"] === "string" ? target["email"] as string : null;
          if (isProtectedSuperAdmin(targetEmail)) {
            throw new ApiError(403, "OWNER_ACCOUNT_PROTECTED", "The protected ZILLIONAIRE owner account cannot be suspended or modified.");
          }
          if (target["accountStatus"] === "DELETED" || target["accountStatus"] === "DELETION_PENDING") {
            throw new ApiError(409, "ACCOUNT_STATUS_TERMINAL", "This account is pending deletion or has been deleted.");
          }
          const previousStatus = typeof target["accountStatus"] === "string"
            ? target["accountStatus"] as string
            : "ACTIVE";
          if (previousStatus === body.status) {
            return { result: { status: previousStatus, changed: false }, writes: [] };
          }
          return {
            result: { status: body.status, changed: true },
            writes: [
              {
                update: {
                  name: fs.docName(targetPath),
                  fields: encodeFields({
                    accountStatus: body.status,
                    accountStatusUpdatedAt: now,
                    accountStatusUpdatedBy: actor.uid,
                    accountStatusReason: body.reason,
                  }),
                },
                updateMask: { fieldPaths: ["accountStatus", "accountStatusUpdatedAt", "accountStatusUpdatedBy", "accountStatusReason"] },
              },
              {
                update: {
                  name: fs.docName(auditPath),
                  fields: encodeFields({
                    actorUid: actor.uid,
                    action: body.status === "SUSPENDED" ? "user.account_suspended" : "user.account_reactivated",
                    targetType: "user",
                    targetId: uid,
                    reason: body.reason,
                    before: { accountStatus: previousStatus },
                    after: { accountStatus: body.status },
                    createdAt: now,
                  }),
                },
                currentDocument: { exists: false },
              },
            ],
          };
        });

        return Response.json({ updated: result.changed, uid, status: result.status });
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
