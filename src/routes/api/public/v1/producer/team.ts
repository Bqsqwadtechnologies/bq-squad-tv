import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { PRODUCER_SCOPES, type ProducerScope } from "@/lib/team-types";

const inviteSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(2).max(100).optional(),
  scopes: z.array(z.enum(["upload", "analytics", "comments", "collaboration"])).min(1),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().trim().min(3).max(500),
});

const updateSchema = z.object({
  memberId: z.string().trim().min(5),
  scopes: z.array(z.enum(["upload", "analytics", "comments", "collaboration"])).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  reason: z.string().trim().min(3).max(500),
});

const removeSchema = z.object({
  memberId: z.string().trim().min(5),
  reason: z.string().trim().min(3).max(500),
});

export const Route = createFileRoute("/api/public/v1/producer/team")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, actor, "producer");

          // Enforce producer tenancy scope: only see members of their own producer workspace
          const members = await fs.query("producer_team_members", {
            filters: [{ field: "producerUid", op: "EQUAL", value: actor.uid }],
            limit: 100,
          });

          return Response.json({
            producerUid: actor.uid,
            members: members.map((m) => ({
              id: (m.__id || m["id"]) as string,
              email: (m["email"] || "Unknown") as string,
              name: (m["name"] || "") as string,
              scopes: (Array.isArray(m["scopes"]) ? m["scopes"] : []) as ProducerScope[],
              status: (m["status"] || "active") as string,
              expiresAt: (m["expiresAt"] || null) as string | null,
              createdAt: (m["createdAt"] || null) as string | null,
            })),
            availableScopes: PRODUCER_SCOPES,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, actor, "producer");

          const body = await parseBody(request, inviteSchema);
          const normalizedEmail = body.email.toLowerCase();

          if (normalizedEmail === (actor.email || "").toLowerCase()) {
            throw new ApiError(400, "SELF_INVITE", "You are already the producer account owner.");
          }

          // Check if already invited for this producer
          const existing = await fs.query("producer_team_members", {
            filters: [
              { field: "producerUid", op: "EQUAL", value: actor.uid },
              { field: "email", op: "EQUAL", value: normalizedEmail },
            ],
            limit: 1,
          });

          if (existing.length > 0) {
            throw new ApiError(409, "ALREADY_MEMBER", "A team member with this email already exists for your studio.");
          }

          const memberId = `pmem_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
          const now = new Date().toISOString();

          await fs.setDoc(`producer_team_members/${memberId}`, {
            id: memberId,
            producerUid: actor.uid,
            email: normalizedEmail,
            name: body.name || normalizedEmail.split("@")[0],
            scopes: body.scopes,
            status: "active",
            expiresAt: body.expiresAt || null,
            createdAt: now,
            createdBy: actor.uid,
          });

          await writeAuditLog(fs, {
            actorUid: actor.uid,
            action: "producer.team_member_added",
            targetType: "producer_team_member",
            targetId: memberId,
            reason: body.reason,
            metadata: {
              producerUid: actor.uid,
              email: normalizedEmail,
              scopes: body.scopes,
              expiresAt: body.expiresAt || null,
            },
          });

          return Response.json({
            success: true,
            memberId,
            email: normalizedEmail,
            scopes: body.scopes,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      PUT: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, actor, "producer");

          const body = await parseBody(request, updateSchema);
          const doc = await fs.getDoc(`producer_team_members/${body.memberId}`);
          if (!doc) {
            throw new ApiError(404, "NOT_FOUND", "Producer team member not found.");
          }

          // Strict tenant check
          if (doc["producerUid"] !== actor.uid) {
            throw new ApiError(403, "FORBIDDEN", "You can only manage members of your own studio.");
          }

          const now = new Date().toISOString();
          const updates: Record<string, unknown> = {
            updatedAt: now,
            updatedBy: actor.uid,
          };

          if (body.scopes) updates["scopes"] = body.scopes;
          if (body.status) updates["status"] = body.status;
          if (body.expiresAt !== undefined) updates["expiresAt"] = body.expiresAt;

          await fs.patchDoc(`producer_team_members/${body.memberId}`, updates);

          await writeAuditLog(fs, {
            actorUid: actor.uid,
            action: "producer.team_member_updated",
            targetType: "producer_team_member",
            targetId: body.memberId,
            reason: body.reason,
            metadata: { producerUid: actor.uid, updates },
          });

          return Response.json({ success: true, memberId: body.memberId, updates });
        } catch (error) {
          return errorBody(error);
        }
      },

      DELETE: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, actor, "producer");

          const body = await parseBody(request, removeSchema);
          const doc = await fs.getDoc(`producer_team_members/${body.memberId}`);
          if (!doc) {
            throw new ApiError(404, "NOT_FOUND", "Producer team member not found.");
          }

          if (doc["producerUid"] !== actor.uid) {
            throw new ApiError(403, "FORBIDDEN", "You can only manage members of your own studio.");
          }

          await fs.patchDoc(`producer_team_members/${body.memberId}`, {
            status: "revoked",
            scopes: [],
            revokedAt: new Date().toISOString(),
            revokedBy: actor.uid,
          });

          await writeAuditLog(fs, {
            actorUid: actor.uid,
            action: "producer.team_member_removed",
            targetType: "producer_team_member",
            targetId: body.memberId,
            reason: body.reason,
            metadata: { producerUid: actor.uid },
          });

          return Response.json({ success: true, removed: true, memberId: body.memberId });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
