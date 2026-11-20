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
import { requireStepUp } from "@/lib/server/zillionaire-access";
import { DASHBOARD_PERMISSIONS } from "@/lib/team-types";

export const BUILTIN_ROLE_TEMPLATES: Record<
  string,
  { label: string; description: string; modules: ZillionaireModule[] }
> = {
  content_manager: {
    label: "Content Manager",
    description: "Manage channels, movies, series, video studio and live TV.",
    modules: ["channels", "catalog", "video"],
  },
  rights_specialist: {
    label: "Rights & Copyright Specialist",
    description: "Inspect copyright chain of title, licensing documents, and claims.",
    modules: ["rights_review", "catalog"],
  },
  live_ops_lead: {
    label: "Live Operations Lead",
    description: "Review, schedule, approve, or force-stop live stream events.",
    modules: ["live_approvals", "channels"],
  },
  finance_officer: {
    label: "Finance Officer",
    description: "Review transactions, wallets, payouts and pricing.",
    modules: ["finance", "payouts", "pricing"],
  },
  support_agent: {
    label: "Support Agent",
    description: "Manage customer support inquiries and tickets.",
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
    modules: ["security", "roles"],
  },
  platform_editor: {
    label: "Editorial & Content Publisher",
    description: "Manage legal pages, notifications, and reports.",
    modules: ["pages", "notifications", "reports"],
  },
};

const inviteSchema = z.object({
  action: z.enum(["invite", "create_role"]).default("invite"),
  email: z.string().trim().email().optional(),
  roleTemplate: z.string().optional(),
  roleName: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  modules: z.array(z.string()).min(1),
  expiryDate: z.string().nullable().optional(),
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
            limit: 150,
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
              roleName: ((u["roleName"] as string) || null) as string | null,
              createdAt: ((u["createdAt"] as string) || null) as string | null,
            }));

          // Load custom role templates
          const customTemplatesDoc = await fs.getDoc("system_settings/role_templates").catch(() => null);
          const customTemplates = (customTemplatesDoc?.["templates"] || {}) as Record<
            string,
            { label: string; description: string; modules: ZillionaireModule[] }
          >;

          const mergedTemplates = {
            ...BUILTIN_ROLE_TEMPLATES,
            ...customTemplates,
          };

          // Load recent audit activity for team members
          const auditRows = await fs
            .query("auditLog", {
              orderByField: "createdAt",
              descending: true,
              limit: 50,
            })
            .catch(() => []);

          const activity = auditRows.map((row) => ({
            id: row.__id,
            actorUid: typeof row["actorUid"] === "string" ? row["actorUid"] : null,
            action: typeof row["action"] === "string" ? row["action"] : "unknown",
            targetType: typeof row["targetType"] === "string" ? row["targetType"] : null,
            targetId: typeof row["targetId"] === "string" ? row["targetId"] : null,
            reason: typeof row["reason"] === "string" ? row["reason"].slice(0, 1000) : "",
            createdAt:
              typeof row["createdAt"] === "string" ? row["createdAt"] : new Date().toISOString(),
          }));

          return Response.json({
            team: teamMembers,
            roleTemplates: mergedTemplates,
            availableModules: ZILLIONAIRE_MODULES,
            availablePermissions: DASHBOARD_PERMISSIONS,
            activity,
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

          // ESCALATION RULE: People with a role cannot change their own role or anyone else's.
          if (!actorAccess.isZillionaireOwner) {
            throw new ApiError(
              403,
              "OWNER_AUTHORITY_REQUIRED",
              "People with a delegated role cannot change their own role or anyone else's. Only the platform owner can manage roles.",
            );
          }

          const body = await parseBody(request, inviteSchema);
          requireStepUp(request, actor.uid, "team_manage");

          // ACTION 1: CREATE CUSTOM ROLE TEMPLATE
          if (body.action === "create_role") {
            if (!body.roleName) {
              throw new ApiError(400, "MISSING_ROLE_NAME", "Role name is required for custom roles.");
            }
            const roleKey = body.roleName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
            const existingDoc = await fs.getDoc("system_settings/role_templates").catch(() => null);
            const currentTemplates = (existingDoc?.["templates"] || {}) as Record<string, unknown>;

            const newTemplate = {
              label: body.roleName,
              description: body.description || `Custom role created by platform owner: ${body.roleName}`,
              modules: body.modules,
              createdAt: new Date().toISOString(),
              createdBy: actor.uid,
            };

            await fs.setDoc("system_settings/role_templates", {
              templates: {
                ...currentTemplates,
                [roleKey]: newTemplate,
              },
              updatedAt: new Date().toISOString(),
            });

            await writeAuditLog(fs, {
              actorUid: actor.uid,
              action: "team.role_template_created",
              targetType: "role_template",
              targetId: roleKey,
              reason: body.reason,
              metadata: newTemplate,
            });

            return Response.json({
              success: true,
              roleKey,
              template: newTemplate,
            });
          }

          // ACTION 2: INVITE / DELEGATE PERMISSIONS TO USER
          if (!body.email) {
            throw new ApiError(400, "MISSING_EMAIL", "User email address is required for role delegation.");
          }

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
            if (targetUid === actor.uid) {
              throw new ApiError(
                403,
                "SELF_ROLE_CHANGE_DENIED",
                "You cannot modify your own role permissions.",
              );
            }
            const targetPath = `users/${targetUid}`;
            await fs.patchDoc(targetPath, {
              zillionaireModules: body.modules,
              adminModules: body.modules,
              roleTemplate: body.roleTemplate || "custom",
              roleName: body.roleName || null,
              permissionsExpiryDate: body.expiryDate || null,
              permissionsUpdatedAt: now,
              permissionsUpdatedBy: actor.uid,
            });
          } else {
            // Create pending placeholder user doc
            targetUid = `team_${Date.now()}`;
            const targetPath = `users/${targetUid}`;
            await fs.setDoc(targetPath, {
              email: normalizedEmail,
              accountStatus: "active",
              zillionaireModules: body.modules,
              adminModules: body.modules,
              roleTemplate: body.roleTemplate || "custom",
              roleName: body.roleName || null,
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
              roleName: body.roleName || null,
              expiryDate: body.expiryDate || null,
            },
          });

          return Response.json({
            success: true,
            uid: targetUid,
            email: normalizedEmail,
            modules: body.modules,
            expiryDate: body.expiryDate || null,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
