import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { getKycProfile, reviewKycProfile } from "@/lib/server/kyc/persistence";
import { CANNED_REJECTION_REASONS, computeSlaDueTime } from "@/lib/server/kyc/compliance";

const bulkSchema = z.object({
  uids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["assign", "escalate", "approve", "reject"]),
  assignedReviewerUid: z.string().optional(),
  escalatedTo: z.string().optional(),
  escalationReason: z.string().optional(),
  cannedReasonCode: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/bulk-action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const access = await resolvePlatformAccess(
            fs,
            user.uid,
            user.email,
            user.customClaims,
            user.emailVerified === true,
          );

          const hasAccess =
            access.isZillionaireOwner ||
            access.zillionaireModules.some((m) =>
              ["security", "compliance", "finance"].includes(m),
            );

          if (!hasAccess) {
            throw new ApiError(403, "FORBIDDEN", "Only compliance and platform owners can perform bulk KYC actions.");
          }

          const body = await parseBody(request, bulkSchema);
          const now = new Date().toISOString();
          const todayDate = now.slice(0, 10);

          let processedCount = 0;
          const skippedHighRisk: string[] = [];
          const notFound: string[] = [];

          let effectiveRejectionReason = body.reason || "";
          if (body.cannedReasonCode && body.cannedReasonCode in CANNED_REJECTION_REASONS) {
            effectiveRejectionReason = CANNED_REJECTION_REASONS[body.cannedReasonCode as keyof typeof CANNED_REJECTION_REASONS];
          }

          if (body.action === "reject" && (!effectiveRejectionReason || effectiveRejectionReason.trim().length < 3)) {
            throw new ApiError(400, "REJECTION_REASON_REQUIRED", "A rejection reason or valid cannedReasonCode is required for bulk rejections.");
          }

          for (const uid of body.uids) {
            const profile = await getKycProfile(fs, uid);
            if (!profile) {
              notFound.push(uid);
              continue;
            }

            if (body.action === "approve") {
              const isHighRisk = profile.requiresFourEyes || profile.riskLevel === "high" || (profile.riskScore && profile.riskScore >= 70);
              if (isHighRisk) {
                // Bulk action cannot bypass four-eyes dual reviewer requirement
                skippedHighRisk.push(uid);
                continue;
              }

              await reviewKycProfile(fs, {
                uid,
                reviewerUid: user.uid,
                status: "approved",
                notes: body.notes || "Bulk approved by compliance",
              });
              processedCount++;
            } else if (body.action === "reject") {
              await reviewKycProfile(fs, {
                uid,
                reviewerUid: user.uid,
                status: "rejected",
                reason: effectiveRejectionReason,
                notes: body.notes,
              });
              processedCount++;
            } else if (body.action === "assign") {
              const assignedUid = body.assignedReviewerUid || user.uid;
              const assignedEmail = body.assignedReviewerUid ? "" : (user.email || "");
              const slaDueAt = computeSlaDueTime(24);

              await fs.patchDoc(`kycProfiles/${uid}`, {
                assignedReviewerUid: assignedUid,
                assignedReviewerEmail: assignedEmail,
                assignedAt: now,
                slaDueAt,
                updatedAt: now,
              });
              processedCount++;
            } else if (body.action === "escalate") {
              const targetEscalation = body.escalatedTo || "senior_compliance";
              const escalationReason = body.escalationReason || body.reason || "Bulk escalated for senior compliance review";

              await fs.patchDoc(`kycProfiles/${uid}`, {
                escalatedTo: targetEscalation,
                escalationReason,
                escalatedAt: now,
                updatedAt: now,
              });
              processedCount++;
            }
          }

          // Record reviewer daily stats
          if (processedCount > 0 && (body.action === "approve" || body.action === "reject" || body.action === "escalate")) {
            const statsPath = `reviewerDailyStats/${user.uid}_${todayDate}`;
            const currentStats = await fs.getDoc(statsPath).catch(() => null);
            await fs.setDoc(statsPath, {
              reviewerUid: user.uid,
              reviewerEmail: user.email || "",
              date: todayDate,
              reviewsCompleted: ((currentStats?.["reviewsCompleted"] as number) || 0) + processedCount,
              approvals: ((currentStats?.["approvals"] as number) || 0) + (body.action === "approve" ? processedCount : 0),
              rejections: ((currentStats?.["rejections"] as number) || 0) + (body.action === "reject" ? processedCount : 0),
              escalations: ((currentStats?.["escalations"] as number) || 0) + (body.action === "escalate" ? processedCount : 0),
              lastActiveAt: now,
            });
          }

          // Write audit log for bulk action
          await writeAuditLog(fs, {
            action: `kyc.bulk_${body.action}`,
            actorUid: user.uid,
            actorEmail: user.email || "",
            targetType: "kyc_batch",
            targetId: `batch_${Date.now()}`,
            reason: body.notes || body.reason || `Bulk ${body.action} performed on ${processedCount} cases`,
            metadata: {
              totalRequested: body.uids.length,
              processedCount,
              skippedHighRisk,
              notFound,
              action: body.action,
            },
          });

          return Response.json({
            ok: true,
            action: body.action,
            processedCount,
            skippedHighRisk,
            notFound,
            completedAt: now,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
