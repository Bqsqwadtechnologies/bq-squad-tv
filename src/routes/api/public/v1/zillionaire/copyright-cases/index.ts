import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const decisionSchema = z.object({
  caseId: z.string().trim().min(1),
  action: z.enum(["remove", "keep", "restore"]),
  decisionNotes: z.string().trim().min(3).max(2000),
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
    return await requireZillionaireModule(fs, user, "moderation");
  } catch {
    return await requireZillionaireModule(fs, user, "content");
  }
}

export const Route = createFileRoute("/api/public/v1/zillionaire/copyright-cases/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireReviewer(fs, user);

          const cases = await fs.query("copyrightCases", {
            orderByField: "createdAt",
            descending: true,
            limit: 100,
          });

          // Enrich cases with current producer repeat-infringer strikes
          const enriched = await Promise.all(
            cases.map(async (c) => {
              const producerUid = String(c["producerUid"] || "");
              let copyrightStrikes = 0;
              if (producerUid && producerUid !== "unknown") {
                const prodDoc = await fs.getDoc(`producers/${producerUid}`).catch(() => null);
                copyrightStrikes = Number(prodDoc?.["copyrightStrikes"] || 0);
              }

              const targetId = String(c["targetId"] || "");
              const asset = targetId ? await fs.getDoc(`contentAssets/${targetId}`).catch(() => null) : null;

              return {
                id: c.__id || c["caseId"],
                caseId: c["caseId"] || c.__id,
                targetType: c["targetType"] || "content_asset",
                targetId,
                targetTitle: c["targetTitle"] || asset?.["title"] || targetId,
                producerUid: producerUid || null,
                producerName: asset?.["ownerName"] || "Producer",
                copyrightStrikes,
                reporterName: c["reporterName"] || "Claimant",
                reporterEmail: c["reporterEmail"] || "",
                reporterOrganization: c["reporterOrganization"] || null,
                workClaimed: c["workClaimed"] || "",
                proofLinkOrPath: c["proofLinkOrPath"] || null,
                goodFaithStatement: Boolean(c["goodFaithStatement"]),
                signature: c["signature"] || "",
                status: c["status"] || "under_review",
                counterNoticeDeadline: c["counterNoticeDeadline"] || null,
                counterNoticeStatus: c["counterNoticeStatus"] || "pending_producer_response",
                emailReceiptSent: Boolean(c["emailReceiptSent"]),
                createdAt: c["createdAt"] || null,
                updatedAt: c["updatedAt"] || null,
                resolvedAt: c["resolvedAt"] || null,
                resolutionNotes: c["notes"] || null,
                timeline: Array.isArray(c["timeline"]) ? c["timeline"] : [],
              };
            }),
          );

          const now = Date.now();
          return Response.json({
            cases: enriched,
            stats: {
              total: enriched.length,
              underReview: enriched.filter((c) => c.status === "under_review").length,
              takedowns: enriched.filter((c) => c.status === "takedown").length,
              restored: enriched.filter((c) => c.status === "restored").length,
              counterNoticeActive: enriched.filter(
                (c) =>
                  c.status === "under_review" &&
                  typeof c.counterNoticeDeadline === "string" &&
                  new Date(c.counterNoticeDeadline).getTime() > now,
              ).length,
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

          const body = await parseBody(request, decisionSchema);
          const caseDoc = await fs.getDoc(`copyrightCases/${body.caseId}`);
          if (!caseDoc) {
            throw new ApiError(404, "CASE_NOT_FOUND", "Copyright case not found.");
          }

          const now = new Date().toISOString();
          const targetId = String(caseDoc["targetId"] || "");
          const producerUid = String(caseDoc["producerUid"] || "");
          const targetTitle = String(caseDoc["targetTitle"] || targetId);
          const currentTimeline = Array.isArray(caseDoc["timeline"]) ? caseDoc["timeline"] : [];

          if (body.action === "remove") {
            // Takedown: remove content and increment producer copyright strike
            await fs.patchDoc(`copyrightCases/${body.caseId}`, {
              status: "takedown",
              resolvedAt: now,
              resolvedBy: user.uid,
              resolution: "removed",
              notes: body.decisionNotes,
              timeline: [
                ...currentTimeline,
                {
                  event: "takedown_enforced",
                  timestamp: now,
                  actor: user.uid,
                  note: `Content removed following copyright review. ${body.decisionNotes}`,
                },
              ],
            });

            if (targetId) {
              await fs.patchDoc(`contentAssets/${targetId}`, {
                contentStatus: "takedown",
                copyrightStatus: "removed",
                reviewQueueFlag: "Copyright takedown enforced",
                takedownReason: body.decisionNotes,
                takedownAt: now,
                takedownBy: user.uid,
                hidden: true,
              });
            }

            // Increment producer repeat infringer strikes
            let newStrikeCount = 1;
            if (producerUid && producerUid !== "unknown") {
              const prod = await fs.getDoc(`producers/${producerUid}`).catch(() => null);
              newStrikeCount = (Number(prod?.["copyrightStrikes"] || 0)) + 1;
              await fs.patchDoc(`producers/${producerUid}`, {
                copyrightStrikes: newStrikeCount,
                lastStrikeAt: now,
                ...(newStrikeCount >= 3 ? { accountFlaggedForStrikes: true } : {}),
              }).catch(() => null);

              // Notify producer
              const notificationId = crypto.randomUUID().replace(/-/g, "");
              await fs.setDoc(`users/${producerUid}/notifications/${notificationId}`, {
                notificationId,
                title: `Copyright Takedown: "${targetTitle}" Removed`,
                body: `Your content was removed due to a copyright infringement finding. Strike ${newStrikeCount} of 3 applied. Note: ${body.decisionNotes}`,
                deepLink: "/producer/channels",
                read: false,
                deliveryStatus: "queued",
                createdAt: now,
                targetType: "content_asset",
                targetId,
              }).catch(() => null);
            }

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "copyright.takedown",
              targetType: "copyright_case",
              targetId: body.caseId,
              reason: body.decisionNotes,
            });
          } else if (body.action === "keep") {
            // Dismiss claim: keep content published
            await fs.patchDoc(`copyrightCases/${body.caseId}`, {
              status: "dismissed",
              resolvedAt: now,
              resolvedBy: user.uid,
              resolution: "claim_dismissed",
              notes: body.decisionNotes,
              timeline: [
                ...currentTimeline,
                {
                  event: "claim_dismissed",
                  timestamp: now,
                  actor: user.uid,
                  note: `Copyright claim dismissed. ${body.decisionNotes}`,
                },
              ],
            });

            if (targetId) {
              await fs.patchDoc(`contentAssets/${targetId}`, {
                contentStatus: "published",
                copyrightStatus: "cleared",
                reviewQueueFlag: null,
                hidden: false,
                clearedAt: now,
              });
            }

            if (producerUid && producerUid !== "unknown") {
              const notificationId = crypto.randomUUID().replace(/-/g, "");
              await fs.setDoc(`users/${producerUid}/notifications/${notificationId}`, {
                notificationId,
                title: `Copyright Claim Dismissed: "${targetTitle}"`,
                body: `The copyright claim against "${targetTitle}" was reviewed and dismissed. Your video remains active.`,
                deepLink: "/producer/channels",
                read: false,
                deliveryStatus: "queued",
                createdAt: now,
                targetType: "content_asset",
                targetId,
              }).catch(() => null);
            }

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "copyright.dismiss",
              targetType: "copyright_case",
              targetId: body.caseId,
              reason: body.decisionNotes,
            });
          } else if (body.action === "restore") {
            // Restore content (e.g. after successful counter-notice)
            await fs.patchDoc(`copyrightCases/${body.caseId}`, {
              status: "restored",
              resolvedAt: now,
              resolvedBy: user.uid,
              resolution: "restored_counter_notice",
              notes: body.decisionNotes,
              timeline: [
                ...currentTimeline,
                {
                  event: "content_restored",
                  timestamp: now,
                  actor: user.uid,
                  note: `Content restored after counter-notice resolution. ${body.decisionNotes}`,
                },
              ],
            });

            if (targetId) {
              await fs.patchDoc(`contentAssets/${targetId}`, {
                contentStatus: "published",
                copyrightStatus: "restored",
                reviewQueueFlag: null,
                hidden: false,
                restoredAt: now,
              });
            }

            if (producerUid && producerUid !== "unknown") {
              const notificationId = crypto.randomUUID().replace(/-/g, "");
              await fs.setDoc(`users/${producerUid}/notifications/${notificationId}`, {
                notificationId,
                title: `Content Restored: "${targetTitle}"`,
                body: `Your content has been restored to published status following counter-notice review.`,
                deepLink: "/producer/channels",
                read: false,
                deliveryStatus: "queued",
                createdAt: now,
                targetType: "content_asset",
                targetId,
              }).catch(() => null);
            }

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "copyright.restore",
              targetType: "copyright_case",
              targetId: body.caseId,
              reason: body.decisionNotes,
            });
          }

          return Response.json({
            ok: true,
            caseId: body.caseId,
            action: body.action,
            message: `Copyright case updated with action "${body.action}".`,
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
