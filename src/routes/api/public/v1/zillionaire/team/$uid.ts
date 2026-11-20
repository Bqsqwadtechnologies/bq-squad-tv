import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import {
  isProtectedZillionaire,
  requireZillionaireModule,
  resolvePlatformAccess,
  ZILLIONAIRE_MODULES,
} from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { requireStepUp } from "@/lib/server/zillionaire-access";

const updateSchema = z.object({
  status: z.enum(["active", "suspended"]).optional(),
  modules: z.array(z.string()).optional(),
  roleTemplate: z.string().optional(),
  roleName: z.string().optional(),
  expiryDate: z.string().nullable().optional(),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/team/$uid")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const uid = params.uid;
          const body = await parseBody(request, updateSchema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "roles");
          const actorAccess = await resolvePlatformAccess(
            fs,
            actor.uid,
            actor.email,
            actor.customClaims,
            actor.emailVerified === true,
          );

          // ESCALATION RULE: People with a role cannot change their own role or anyone else's.
          if (!actorAccess.isZillionaireOwner) {
            throw new ApiError(
              403,
              "OWNER_AUTHORITY_REQUIRED",
              "People with a delegated role cannot change their own role or anyone else's. Only the platform owner can manage roles.",
            );
          }

          requireStepUp(request, actor.uid, "team_manage");
          if (uid === actor.uid) {
            throw new ApiError(
              403,
              "SELF_ROLE_CHANGE_DENIED",
              "People with a role cannot change their own role.",
            );
          }

          const targetPath = `users/${uid}`;
          const target = await fs.getDoc(targetPath);
          if (!target) {
            throw new ApiError(404, "USER_NOT_FOUND", "Team member not found.");
          }

          const targetEmail = typeof target["email"] === "string" ? target["email"] : "";
          if (isProtectedZillionaire(targetEmail)) {
            throw new ApiError(
              403,
              "OWNER_ACCOUNT_PROTECTED",
              "Owner account cannot be modified through team management.",
            );
          }

          const now = new Date().toISOString();
          const updates: Record<string, unknown> = {
            permissionsUpdatedAt: now,
            permissionsUpdatedBy: actor.uid,
          };

          if (body.status) updates["accountStatus"] = body.status;
          if (body.modules) {
            updates["zillionaireModules"] = body.modules;
            updates["adminModules"] = body.modules;
          }
          if (body.roleTemplate) updates["roleTemplate"] = body.roleTemplate;
          if (body.roleName !== undefined) updates["roleName"] = body.roleName;
          if (body.expiryDate !== undefined) updates["permissionsExpiryDate"] = body.expiryDate;

          await fs.patchDoc(targetPath, updates);

          await writeAuditLog(fs, {
            actorUid: actor.uid,
            action: "team.member_updated",
            targetType: "user",
            targetId: uid,
            reason: body.reason,
            metadata: updates,
          });

          return Response.json({ success: true, uid, updates });
        } catch (error) {
          return errorBody(error);
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const uid = params.uid;
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "roles");
          const actorAccess = await resolvePlatformAccess(
            fs,
            actor.uid,
            actor.email,
            actor.customClaims,
            actor.emailVerified === true,
          );

          // ESCALATION RULE: People with a role cannot change their own role or anyone else's.
          if (!actorAccess.isZillionaireOwner) {
            throw new ApiError(
              403,
              "OWNER_AUTHORITY_REQUIRED",
              "People with a delegated role cannot change their own role or anyone else's. Only the platform owner can revoke roles.",
            );
          }

          requireStepUp(request, actor.uid, "team_manage");
          if (uid === actor.uid) {
            throw new ApiError(403, "OWNER_ACCOUNT_PROTECTED", "Owner account cannot be revoked.");
          }

          const targetPath = `users/${uid}`;
          const target = await fs.getDoc(targetPath);
          if (!target) {
            throw new ApiError(404, "USER_NOT_FOUND", "Team member not found.");
          }

          const targetEmail = typeof target["email"] === "string" ? target["email"] : "";
          if (isProtectedZillionaire(targetEmail)) {
            throw new ApiError(403, "OWNER_ACCOUNT_PROTECTED", "Owner account cannot be revoked.");
          }

          const now = new Date().toISOString();
          // Instant revocation: remove all modules and set suspended
          await fs.patchDoc(targetPath, {
            zillionaireModules: [],
            adminModules: [],
            accountStatus: "suspended",
            permissionsRevokedAt: now,
            permissionsRevokedBy: actor.uid,
          });

          await writeAuditLog(fs, {
            actorUid: actor.uid,
            action: "team.member_revoked",
            targetType: "user",
            targetId: uid,
            reason: "Instant role revocation by owner",
          });

          return Response.json({ success: true, revoked: true, uid });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
