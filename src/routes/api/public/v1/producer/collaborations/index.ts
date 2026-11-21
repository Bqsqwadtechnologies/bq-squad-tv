import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { validateSplits } from "@/lib/server/billing-engine";

const splitItemSchema = z.object({
  email: z.string().trim().email(),
  shareBps: z.number().int().min(1).max(10000), // e.g. 7000 = 70.00%, 550 = 5.50%
  role: z.string().trim().max(100).default("Collaborator"),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE_OR_INVITE"),
    titleId: z.string().trim().min(1).max(100),
    titleName: z.string().trim().min(1).max(200),
    splits: z.array(splitItemSchema).min(2).max(10),
  }),
  z.object({
    action: z.literal("CONFIRM_AGREEMENT"),
    collaborationId: z.string().trim().min(1),
    version: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("UPDATE_SPLIT"),
    collaborationId: z.string().trim().min(1),
    splits: z.array(splitItemSchema).min(2).max(10),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal("DISPUTE"),
    collaborationId: z.string().trim().min(1),
    reason: z.string().trim().min(5).max(1000),
  }),
  z.object({
    action: z.literal("LEAVE"),
    collaborationId: z.string().trim().min(1),
    reason: z.string().trim().min(3).max(500),
  }),
]);

export const Route = createFileRoute("/api/public/v1/producer/collaborations/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");

          const userEmail = (user.email || "").toLowerCase();
          const allCollabs = (await fs.query("collaborations", { limit: 100 })) || [];

          // Filter collabs where user is lead (ownerUid) or listed in splits
          const userCollabs = allCollabs.filter((c) => {
            if (c["leadUid"] === user.uid) return true;
            const splits = Array.isArray(c["splits"]) ? c["splits"] : [];
            return splits.some(
              (s: any) =>
                (s.email && s.email.toLowerCase() === userEmail) ||
                (s.uid && s.uid === user.uid),
            );
          });

          return Response.json({ collaborations: userCollabs });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");

          const body = await parseBody(request, actionSchema);
          const now = new Date().toISOString();
          const userEmail = (user.email || "").toLowerCase();

          if (body.action === "CREATE_OR_INVITE") {
            // Check that splits sum to 10,000 basis points
            const totalBps = body.splits.reduce((acc, s) => acc + s.shareBps, 0);
            if (totalBps !== 10000) {
              throw new ApiError(
                400,
                "INVALID_SPLIT_SUM",
                `The sum of all collaboration shares must be exactly 100% (10,000 basis points). Current sum: ${(totalBps / 100).toFixed(2)}%.`,
              );
            }

            const collabId = `collab_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
            const record = {
              id: collabId,
              titleId: body.titleId,
              titleName: body.titleName,
              leadUid: user.uid,
              leadEmail: userEmail,
              version: 1,
              status: "pending_confirmation",
              splits: body.splits.map((s) => ({
                email: s.email.toLowerCase(),
                shareBps: s.shareBps,
                role: s.role,
                confirmed: s.email.toLowerCase() === userEmail,
                confirmedAt: s.email.toLowerCase() === userEmail ? now : null,
              })),
              createdAt: now,
              updatedAt: now,
            };

            await fs.setDoc(`collaborations/${collabId}`, record);

            // Audit
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "collaboration.created",
              targetType: "collaboration",
              targetId: collabId,
              reason: "Producer created a collaboration and invited revenue stakeholders.",
              metadata: { titleId: body.titleId, totalSplits: body.splits.length },
            });

            return Response.json({ success: true, collaboration: record });
          }

          if (body.action === "CONFIRM_AGREEMENT") {
            const collab = await fs.getDoc(`collaborations/${body.collaborationId}`);
            if (!collab) throw new ApiError(404, "COLLABORATION_NOT_FOUND", "Collaboration not found.");

            if (collab["version"] !== body.version) {
              throw new ApiError(409, "VERSION_MISMATCH", "Agreement has been updated. Please review and confirm the latest version.");
            }

            const splits = Array.isArray(collab["splits"]) ? collab["splits"] : [];
            let confirmedCount = 0;
            const updatedSplits = splits.map((s: any) => {
              if (s.email.toLowerCase() === userEmail || s.uid === user.uid) {
                confirmedCount++;
                return { ...s, confirmed: true, confirmedAt: now, uid: user.uid };
              }
              if (s.confirmed) confirmedCount++;
              return s;
            });

            const allConfirmed = confirmedCount === splits.length;
            const updated = {
              ...collab,
              splits: updatedSplits,
              status: allConfirmed ? "active" : "pending_confirmation",
              updatedAt: now,
            };

            await fs.setDoc(`collaborations/${body.collaborationId}`, updated);

            return Response.json({ success: true, collaboration: updated });
          }

          if (body.action === "UPDATE_SPLIT") {
            const collab = await fs.getDoc(`collaborations/${body.collaborationId}`);
            if (!collab) throw new ApiError(404, "COLLABORATION_NOT_FOUND", "Collaboration not found.");
            if (collab["leadUid"] !== user.uid) {
              throw new ApiError(403, "FORBIDDEN", "Only the lead producer can propose revised splits.");
            }

            const totalBps = body.splits.reduce((acc, s) => acc + s.shareBps, 0);
            if (totalBps !== 10000) {
              throw new ApiError(
                400,
                "INVALID_SPLIT_SUM",
                `Split shares must sum to exactly 100% (10,000 bps). Current: ${(totalBps / 100).toFixed(2)}%.`,
              );
            }

            const nextVersion = (Number(collab["version"]) || 1) + 1;
            const updated = {
              ...collab,
              version: nextVersion,
              status: "pending_reconfirmation",
              splits: body.splits.map((s) => ({
                email: s.email.toLowerCase(),
                shareBps: s.shareBps,
                role: s.role,
                confirmed: s.email.toLowerCase() === userEmail,
                confirmedAt: s.email.toLowerCase() === userEmail ? now : null,
              })),
              revisionReason: body.reason,
              updatedAt: now,
            };

            await fs.setDoc(`collaborations/${body.collaborationId}`, updated);

            return Response.json({ success: true, collaboration: updated });
          }

          if (body.action === "DISPUTE") {
            const collab = await fs.getDoc(`collaborations/${body.collaborationId}`);
            if (!collab) throw new ApiError(404, "COLLABORATION_NOT_FOUND", "Collaboration not found.");

            const updated = {
              ...collab,
              status: "disputed",
              disputeReason: body.reason,
              disputedBy: user.uid,
              disputedAt: now,
              updatedAt: now,
            };

            await fs.setDoc(`collaborations/${body.collaborationId}`, updated);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "collaboration.disputed",
              targetType: "collaboration",
              targetId: body.collaborationId,
              reason: body.reason,
            });

            return Response.json({ success: true, collaboration: updated });
          }

          if (body.action === "LEAVE") {
            const collab = await fs.getDoc(`collaborations/${body.collaborationId}`);
            if (!collab) throw new ApiError(404, "COLLABORATION_NOT_FOUND", "Collaboration not found.");

            const updated = {
              ...collab,
              status: "revision_required",
              leaveRequestedBy: user.uid,
              leaveReason: body.reason,
              leaveRequestedAt: now,
              updatedAt: now,
            };

            await fs.setDoc(`collaborations/${body.collaborationId}`, updated);

            return Response.json({ success: true, collaboration: updated });
          }

          throw new ApiError(400, "INVALID_ACTION", "Unknown collaboration action.");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
