import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import {
  isProtectedZillionaire,
  requireZillionaireModule,
  resolvePlatformAccess,
  ZILLIONAIRE_MODULES,
  type ZillionaireModule,
} from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export const ROLE_TEMPLATES: Record<
  string,
  { label: string; description: string; modules: ZillionaireModule[] }
> = {
  content_manager: {
    label: "Content Manager",
    description: "Manage channels, movies, series, video studio and live TV.",
    modules: ["channels", "catalog", "video"],
  },
  finance_officer: {
    label: "Finance Officer",
    description: "Review transactions, wallets, payouts and pricing.",
    modules: ["finance", "pricing"],
  },
  support_agent: {
    label: "Support Agent",
    description: "Manage support tickets and inquiries.",
    modules: ["support"],
  },
  moderator: {
    label: "Moderator",
    description: "Moderate user comments, ratings and reports.",
    modules: ["moderation"],
  },
  ads_manager: {
    label: "Ads Manager",
    description: "Configure ad networks, placements and campaigns.",
    modules: ["ads"],
  },
  security_reviewer: {
    label: "Security Reviewer",
    description: "Inspect security events, audit logs and rate limits.",
    modules: ["roles"],
  },
};

const inviteSchema = z.object({
  email: z.string().trim().email(),
  roleTemplate: z.string().optional(),
  modules: z.array(z.enum(ZILLIONAIRE_MODULES as [string, ...string[]])).min(1),
  expiryDate: z.string().optional(),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/team")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "roles");

          // Query users collection for accounts with delegated modules
          const allUsers = await fs.query("users", {
            limit: 100,
          });

          const teamMembers = allUsers
            .filter((u) => {
              const modules = Array.isArray(u["zillionaireModules"])
                ? (u["zillionaireModules"] as string[])
                : [];
              return modules.length > 0;
            })
            .map((u) => ({
              uid: (u.__id || u["id"] || u["uid"] || "") as string,
              email: ((u["email"] as string) || "Unknown") as string,
              modules: (Array.isArray(u["zillionaireModules"])
                ? (u["zillionaireModules"] as string[])
                : []) as string[],
              status: ((u["accountStatus"] as string) || "active") as string,
              expiryDate: ((u["permissionsExpiryDate"] as string) || null) as string | null,
              lastActive: ((u["lastActiveAt"] as string) || (u["updatedAt"] as string) || null) as
                string | null,
              roleTemplate: ((u["roleTemplate"] as string) || "custom") as string,
            }));

          return Response.json({
            team: teamMembers,
            roleTemplates: ROLE_TEMPLATES,
            availableModules: ZILLIONAIRE_MODULES,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "roles");
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
              "Only the platform owner can invite or grant team roles.",
            );
          }

          const body = await parseBody(request, inviteSchema);
          const normalizedEmail = body.email.toLowerCase();

          if (isProtectedZillionaire(normalizedEmail)) {
            throw new ApiError(
              403,
              "OWNER_ACCOUNT_PROTECTED",
              "Owner account permissions cannot be managed through team invites.",
            );
          }

          // Check if user exists by querying email
          const matchingUsers = await fs.query("users", {
            filters: [{ field: "email", op: "EQUAL", value: normalizedEmail }],
            limit: 1,
          });

          const now = new Date().toISOString();
          let targetUid: string;

          if (matchingUsers.length > 0 && matchingUsers[0]) {
            targetUid = (matchingUsers[0].__id ||
              matchingUsers[0]["id"] ||
              matchingUsers[0]["uid"] ||
              "") as string;
            const targetPath = `users/${targetUid}`;
            await fs.patchDoc(targetPath, {
              zillionaireModules: body.modules,
              adminModules: body.modules,
              roleTemplate: body.roleTemplate || "custom",
              permissionsExpiryDate: body.expiryDate || null,
              permissionsUpdatedAt: now,
              permissionsUpdatedBy: actor.uid,
            });
          } else {
            // Create pending invitation / placeholder user doc
            targetUid = `team_${Date.now()}`;
            const targetPath = `users/${targetUid}`;
            await fs.setDoc(targetPath, {
              email: normalizedEmail,
              accountStatus: "active",
              zillionaireModules: body.modules,
              adminModules: body.modules,
              roleTemplate: body.roleTemplate || "custom",
              permissionsExpiryDate: body.expiryDate || null,
              permissionsUpdatedAt: now,
              permissionsUpdatedBy: actor.uid,
              createdAt: now,
            });
          }

          await writeAuditLog(fs, {
            actorUid: actor.uid,
            action: "team.member_invited",
            targetType: "user",
            targetId: targetUid,
            reason: body.reason,
            metadata: {
              email: normalizedEmail,
              modules: body.modules,
              roleTemplate: body.roleTemplate || "custom",
              expiryDate: body.expiryDate || null,
            },
          });

          return Response.json({
            success: true,
            uid: targetUid,
            email: normalizedEmail,
            modules: body.modules,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
