import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import {
  isProtectedZillionaire,
  resolvePlatformAccess,
  ZILLIONAIRE_MODULES,
} from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z
  .object({
    modules: z
      .array(z.enum(ZILLIONAIRE_MODULES as [string, ...string[]]))
      .max(ZILLIONAIRE_MODULES.length),
    complianceExpiresAt: z.string().optional(),
    reason: z.string().trim().min(3).max(1000),
  })
  .superRefine((value, context) => {
    if (new Set(value.modules).size !== value.modules.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modules"],
        message: "Permission modules must be unique.",
      });
    }
  });

export const Route = createFileRoute("/api/public/v1/zillionaire/users/$uid/permissions")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const uid = params.uid;
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
            throw new ApiError(400, "USER_ID_INVALID", "The target user identifier is invalid.");
          }
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          const actorAccess = await resolvePlatformAccess(
            fs,
            actor.uid,
            actor.email,
            actor.customClaims,
            actor.emailVerified === true,
          );
          if (!actorAccess.isZillionaireOwner) {
            throw new ApiError(
              403,
              "OWNER_AUTHORITY_REQUIRED",
              "Only the protected ZILLIONAIRE owner can delegate platform-control permissions.",
            );
          }
          if (uid === actor.uid) {
            throw new ApiError(
              403,
              "OWNER_ACCOUNT_PROTECTED",
              "The protected platform-owner account cannot be modified through delegated permissions.",
            );
          }
          await enforceRateLimit(fs, "platform-permission-change:" + actor.uid, {
            limit: 20,
            windowMs: 60_000,
          });

          const targetPath = "users/" + uid;
          const target = await fs.getDoc(targetPath);
          if (!target)
            throw new ApiError(404, "USER_NOT_FOUND", "The target user profile does not exist.");
          const targetEmail =
            typeof target["email"] === "string" ? (target["email"] as string) : null;
          if (isProtectedZillionaire(targetEmail)) {
            throw new ApiError(
              403,
              "OWNER_ACCOUNT_PROTECTED",
              "The protected platform-owner account cannot be modified through delegated permissions.",
            );
          }

          const now = new Date().toISOString();
          const modules = [...new Set(body.modules)];
          await fs.transact([targetPath], (docs) => {
            const current = docs[0];
            if (!current)
              throw new ApiError(
                404,
                "USER_NOT_FOUND",
                "The target user profile no longer exists.",
              );
            const currentRoles = Array.isArray(current["roleTags"])
              ? (current["roleTags"] as unknown[]).filter(
                  (role): role is string => typeof role === "string",
                )
              : [];
            // Module permissions are not an administrator role. Keep role tags free of control-centre labels.
            const roleTags = currentRoles.filter((role) => role !== "admin");
            return {
              result: undefined,
              writes: [
                {
                  update: {
                    name: fs.docName(targetPath),
                    fields: encodeFields({
                      zillionaireModules: modules,
                      adminModules: modules,
                      roleTags,
                      complianceExpiresAt: body.complianceExpiresAt || null,
                      permissionsUpdatedAt: now,
                      permissionsUpdatedBy: actor.uid,
                    }),
                  },
                  updateMask: {
                    fieldPaths: [
                      "zillionaireModules",
                      "adminModules",
                      "roleTags",
                      "complianceExpiresAt",
                      "permissionsUpdatedAt",
                      "permissionsUpdatedBy",
                    ],
                  },
                },
              ],
            };
          });

          await writeAuditLog(fs, {
            actorUid: actor.uid,
            action:
              modules.length > 0 ? "platform.permissions_granted" : "platform.permissions_revoked",
            targetType: "user",
            targetId: uid,
            reason: body.reason,
            metadata: { modules },
          });
          return Response.json({ updated: true, uid, modules, complianceExpiresAt: body.complianceExpiresAt || null });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
