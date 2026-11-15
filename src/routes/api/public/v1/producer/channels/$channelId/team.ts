import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import {
  CHANNEL_ROLE_TEMPLATES,
  hasChannelPermission,
  requireChannelPermission,
  type ChannelRole,
} from "@/lib/server/channel-access";
import { writeAuditLog } from "@/lib/server/audit";

const roleSchema = z.enum(["co-owner", "manager", "scheduler", "uploader", "moderator", "analyst", "finance"]);
const permissionSchema = z.enum([
  "channel.settings", "team.manage", "video.upload", "video.delete", "schedule.write",
  "schedule.publish", "analytics.read", "analytics.read.own", "earnings.read",
  "payout.write", "ads.manage", "chat.moderate",
]);
const updateSchema = z.object({
  memberUid: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/),
  role: roleSchema,
  permissions: z.array(permissionSchema).max(20).optional(),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().trim().min(3).max(500),
});
const removeSchema = z.object({
  memberUid: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/),
  reason: z.string().trim().min(3).max(500),
});

function activeRole(channel: Record<string, unknown>, member: Record<string, unknown> | null, uid: string): ChannelRole | null {
  if (channel["ownerUid"] === uid) return "owner";
  if (!member || member["status"] !== "ACTIVE") return null;
  if (typeof member["expiresAt"] === "string" && Date.parse(member["expiresAt"]) <= Date.now()) return null;
  const role = member["role"];
  if (typeof role !== "string" || role === "owner" || !Object.prototype.hasOwnProperty.call(CHANNEL_ROLE_TEMPLATES, role)) return null;
  return role as ChannelRole;
}

function mayManageRole(actor: ChannelRole, target: ChannelRole): boolean {
  if (actor === "owner") return target !== "owner";
  if (actor === "co-owner") return target !== "co-owner" && target !== "owner";
  if (actor === "manager") {
    return ["scheduler", "uploader", "moderator", "analyst", "finance"].includes(target);
  }
  return false;
}

export const Route = createFileRoute("/api/public/v1/producer/channels/$channelId/team")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const channelId = params.channelId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(channelId)) throw new ApiError(400, "CHANNEL_ID_INVALID", "The channel identifier is invalid.");
          const fs = await Firestore.create();
          await requireChannelPermission(fs, channelId, user.uid, "team.manage");
          const members = await fs.query("channels/" + channelId + "/members", { limit: 100 });
          return Response.json(members.map(member => ({
            uid: member.__id,
            role: member["role"] ?? "unknown",
            permissions: Array.isArray(member["permissions"]) ? member["permissions"] : [],
            status: member["status"] ?? "UNKNOWN",
            expiresAt: member["expiresAt"] ?? null,
          })));
        } catch (error) { return errorBody(error); }
      },
      PUT: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, updateSchema);
          const channelId = params.channelId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(channelId)) throw new ApiError(400, "CHANNEL_ID_INVALID", "The channel identifier is invalid.");
          if (body.memberUid === user.uid) throw new ApiError(400, "SELF_MEMBERSHIP_EDIT", "Use another channel owner or manager to change your own team access.");
          const template = [...CHANNEL_ROLE_TEMPLATES[body.role]];
          const permissions = body.permissions ?? template;
          if (permissions.some(permission => !template.includes(permission))) {
            throw new ApiError(400, "ROLE_PERMISSION_ESCALATION", "Custom permissions may only remove permissions from the selected role template.");
          }
          const fs = await Firestore.create();
          const now = new Date().toISOString();
          await fs.transact([
            "channels/" + channelId,
            "channels/" + channelId + "/members/" + user.uid,
            "channels/" + channelId + "/members/" + body.memberUid,
            "users/" + body.memberUid,
          ], docs => {
            const [channel, actorMember, currentMember, targetUser] = docs;
            if (!channel) throw new ApiError(404, "CHANNEL_NOT_FOUND", "This channel does not exist.");
            if (!targetUser || targetUser["status"] === "SUSPENDED" || targetUser["status"] === "DELETED") {
              throw new ApiError(404, "TEAM_USER_NOT_FOUND", "The selected account is unavailable.");
            }
            const actorRole = activeRole(channel, actorMember ?? null, user.uid);
            const actorPermissions = actorRole === "owner"
              ? [...CHANNEL_ROLE_TEMPLATES.owner]
              : Array.isArray(actorMember?.["permissions"])
                ? actorMember["permissions"].filter((value): value is string => typeof value === "string")
                : actorRole ? [...CHANNEL_ROLE_TEMPLATES[actorRole]] : [];
            if (!actorRole || !hasChannelPermission({ role: actorRole, permissions: actorPermissions }, "team.manage")) {
              throw new ApiError(403, "CHANNEL_PERMISSION_REQUIRED", "You no longer have permission to manage this channel team.");
            }
            const currentRole = currentMember ? activeRole(channel, currentMember, body.memberUid) : null;
            if (currentRole && !mayManageRole(actorRole, currentRole)) {
              throw new ApiError(403, "TEAM_ROLE_MANAGEMENT_DENIED", "You cannot change a team member with an equal or higher role.");
            }
            if (!mayManageRole(actorRole, body.role as ChannelRole)) {
              throw new ApiError(403, "TEAM_ROLE_GRANT_DENIED", "You cannot grant this role. Ask the channel owner.");
            }
            return {
              result: undefined,
              writes: [{
                update: {
                  name: fs.docName("channels/" + channelId + "/members/" + body.memberUid),
                  fields: encodeFields({
                    uid: body.memberUid,
                    role: body.role,
                    permissions,
                    status: "ACTIVE",
                    expiresAt: body.expiresAt ?? null,
                    createdAt: currentMember?.["createdAt"] ?? now,
                    createdBy: currentMember?.["createdBy"] ?? user.uid,
                    updatedAt: now,
                    updatedBy: user.uid,
                  }),
                },
              }],
            };
          });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "channel.team_member_updated",
            targetType: "channelMember",
            targetId: channelId + ":" + body.memberUid,
            reason: body.reason,
            metadata: { channelId, role: body.role, permissionCount: permissions.length, expiresAt: body.expiresAt ?? null },
          });
          return Response.json({ saved: true, channelId, memberUid: body.memberUid, role: body.role });
        } catch (error) { return errorBody(error); }
      },
      DELETE: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, removeSchema);
          const channelId = params.channelId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(channelId)) throw new ApiError(400, "CHANNEL_ID_INVALID", "The channel identifier is invalid.");
          if (body.memberUid === user.uid) throw new ApiError(400, "SELF_MEMBERSHIP_REMOVE", "Ask another channel owner or manager to change your team access.");
          const fs = await Firestore.create();
          await fs.transact([
            "channels/" + channelId,
            "channels/" + channelId + "/members/" + user.uid,
            "channels/" + channelId + "/members/" + body.memberUid,
          ], docs => {
            const [channel, actorMember, targetMember] = docs;
            if (!channel) throw new ApiError(404, "CHANNEL_NOT_FOUND", "This channel does not exist.");
            if (channel["ownerUid"] === body.memberUid) throw new ApiError(403, "CHANNEL_OWNER_PROTECTED", "The channel owner cannot be removed from the team.");
            const actorRole = activeRole(channel, actorMember ?? null, user.uid);
            const actorPermissions = actorRole === "owner"
              ? [...CHANNEL_ROLE_TEMPLATES.owner]
              : Array.isArray(actorMember?.["permissions"])
                ? actorMember["permissions"].filter((value): value is string => typeof value === "string")
                : actorRole ? [...CHANNEL_ROLE_TEMPLATES[actorRole]] : [];
            if (!actorRole || !hasChannelPermission({ role: actorRole, permissions: actorPermissions }, "team.manage")) {
              throw new ApiError(403, "CHANNEL_PERMISSION_REQUIRED", "You no longer have permission to manage this channel team.");
            }
            const targetRole = targetMember ? activeRole(channel, targetMember, body.memberUid) : null;
            if (!targetMember || !targetRole) throw new ApiError(404, "TEAM_MEMBER_NOT_FOUND", "This account is not an active team member.");
            if (!mayManageRole(actorRole, targetRole)) throw new ApiError(403, "TEAM_ROLE_MANAGEMENT_DENIED", "You cannot remove a team member with an equal or higher role.");
            return { result: undefined, writes: [{ delete: fs.docName("channels/" + channelId + "/members/" + body.memberUid) }] };
          });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "channel.team_member_removed",
            targetType: "channelMember",
            targetId: channelId + ":" + body.memberUid,
            reason: body.reason,
            metadata: { channelId },
          });
          return Response.json({ removed: true, channelId, memberUid: body.memberUid });
        } catch (error) { return errorBody(error); }
      },
    },
  },
});
