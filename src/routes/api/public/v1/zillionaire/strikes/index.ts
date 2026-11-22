import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const strikeDecisionSchema = z.object({
  strikeId: z.string().trim().min(1),
  action: z.enum(["grant_appeal", "reject_appeal", "issue_strike", "dismiss_strike"]),
  decisionNotes: z.string().trim().min(3).max(2000),
  // Optional for new strike creation
  accountUid: z.string().trim().optional(),
  accountRole: z.enum(["producer", "provider", "viewer"]).optional(),
  accountEmail: z.string().email().optional(),
  strikeType: z.enum(["copyright", "community_guidelines", "kyc_fraud"]).optional(),
  penaltiesActive: z.string().trim().optional(),
});

async function requireReviewer(
  fs: Firestore,
  user: {
    uid: string;
    email: string | null;
    emailVerified?: boolean;
    customClaims?: Record<string, unknown>;
  },
) {
  try {
    return await requireZillionaireModule(fs, user, "security");
  } catch {
    return await requireZillionaireModule(fs, user, "moderation");
  }
}

export const Route = createFileRoute("/api/public/v1/zillionaire/strikes/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireReviewer(fs, user);

          const strikesDocs = await fs.query("accountStrikes", {
            orderByField: "issuedAt",
            descending: true,
            limit: 100,
          });

          const strikes = strikesDocs.map((s) => ({
            id: s.__id || s["id"] || s["strikeId"],
            strikeId: s["strikeId"] || s.__id,
            accountUid: String(s["accountUid"] || ""),
            accountRole: (s["accountRole"] || "producer") as "producer" | "provider" | "viewer",
            accountEmail: String(s["accountEmail"] || "user@example.com"),
            strikeCount: Number(s["strikeCount"] || 1),
            strikeType: (s["strikeType"] || "copyright") as "copyright" | "community_guidelines" | "kyc_fraud",
            reason: String(s["reason"] || "Policy violation"),
            penaltiesActive: String(s["penaltiesActive"] || "Monetisation freeze"),
            appealStatus: (s["appealStatus"] || "none") as "none" | "submitted" | "approved" | "rejected",
            appealNotes: s["appealNotes"] || null,
            issuedAt: s["issuedAt"] || new Date().toISOString(),
            expiresAt: s["expiresAt"] || new Date(Date.now() + 90 * 86400000).toISOString(),
            resolvedAt: s["resolvedAt"] || null,
            resolvedBy: s["resolvedBy"] || null,
          }));

          return Response.json({
            strikes,
            stats: {
              total: strikes.length,
              pendingAppeals: strikes.filter((s) => s.appealStatus === "submitted").length,
              criticalStrikes: strikes.filter((s) => s.strikeCount >= 3).length,
            },
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireReviewer(fs, user);

          const body = await parseBody(request, strikeDecisionSchema);
          const now = new Date().toISOString();

          if (body.action === "issue_strike") {
            if (!body.accountUid || !body.accountEmail) {
              throw new ApiError(400, "MISSING_ACCOUNT", "accountUid and accountEmail are required to issue a strike.");
            }

            const strikeId = body.strikeId || `str_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
            const expiry = new Date(Date.now() + 90 * 86400000).toISOString();

            // Look up existing strikes for account
            const existing = await fs.query("accountStrikes", {
              filters: [{ field: "accountUid", op: "EQUAL", value: body.accountUid }],
            });
            const currentCount = existing.length + 1;

            await fs.setDoc(`accountStrikes/${strikeId}`, {
              strikeId,
              accountUid: body.accountUid,
              accountRole: body.accountRole || "producer",
              accountEmail: body.accountEmail,
              strikeCount: currentCount,
              strikeType: body.strikeType || "community_guidelines",
              reason: body.decisionNotes,
              penaltiesActive: body.penaltiesActive || "Upload restrictions enforced",
              appealStatus: "none",
              issuedAt: now,
              expiresAt: expiry,
              issuedBy: user.uid,
            });

            // Update producer doc if producer
            if (body.accountRole === "producer") {
              await fs.patchDoc(`producers/${body.accountUid}`, {
                copyrightStrikes: currentCount,
                lastStrikeAt: now,
                ...(currentCount >= 3 ? { accountFlaggedForStrikes: true } : {}),
              }).catch(() => null);
            }

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "strike.issued",
              targetType: "account_strike",
              targetId: strikeId,
              reason: body.decisionNotes,
            });

            return Response.json({
              ok: true,
              strikeId,
              message: `Strike ${currentCount} issued to ${body.accountEmail}.`,
            });
          }

          // Grant or reject appeal
          const strikeDoc = await fs.getDoc(`accountStrikes/${body.strikeId}`);
          if (!strikeDoc) {
            throw new ApiError(404, "STRIKE_NOT_FOUND", "Account strike record not found.");
          }

          if (body.action === "grant_appeal") {
            const newCount = Math.max(0, Number(strikeDoc["strikeCount"] || 1) - 1);
            await fs.patchDoc(`accountStrikes/${body.strikeId}`, {
              appealStatus: "approved",
              strikeCount: newCount,
              resolvedAt: now,
              resolvedBy: user.uid,
              resolutionNotes: body.decisionNotes,
            });

            const accountUid = String(strikeDoc["accountUid"] || "");
            if (accountUid && strikeDoc["accountRole"] === "producer") {
              await fs.patchDoc(`producers/${accountUid}`, {
                copyrightStrikes: newCount,
                accountFlaggedForStrikes: newCount >= 3,
              }).catch(() => null);
            }

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "strike.appeal_granted",
              targetType: "account_strike",
              targetId: body.strikeId,
              reason: body.decisionNotes,
            });

            return Response.json({
              ok: true,
              strikeId: body.strikeId,
              action: body.action,
              message: `Appeal granted. Strike count reduced to ${newCount}.`,
            });
          } else if (body.action === "reject_appeal") {
            await fs.patchDoc(`accountStrikes/${body.strikeId}`, {
              appealStatus: "rejected",
              resolvedAt: now,
              resolvedBy: user.uid,
              resolutionNotes: body.decisionNotes,
            });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "strike.appeal_rejected",
              targetType: "account_strike",
              targetId: body.strikeId,
              reason: body.decisionNotes,
            });

            return Response.json({
              ok: true,
              strikeId: body.strikeId,
              action: body.action,
              message: "Strike appeal rejected after review.",
            });
          } else if (body.action === "dismiss_strike") {
            await fs.deleteDoc(`accountStrikes/${body.strikeId}`).catch(() => {
              return fs.patchDoc(`accountStrikes/${body.strikeId}`, {
                appealStatus: "dismissed",
                strikeCount: 0,
                resolvedAt: now,
                resolvedBy: user.uid,
                resolutionNotes: body.decisionNotes,
              });
            });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "strike.dismissed",
              targetType: "account_strike",
              targetId: body.strikeId,
              reason: body.decisionNotes,
            });

            return Response.json({
              ok: true,
              strikeId: body.strikeId,
              action: body.action,
              message: "Strike dismissed and removed from record.",
            });
          }

          throw new ApiError(400, "INVALID_ACTION", "Unrecognized strike action.");
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
