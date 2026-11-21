import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { CANNED_REJECTION_REASONS, isSlaBreached } from "@/lib/server/kyc/compliance";
import { type KycProfile } from "@/lib/server/kyc/types";

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/operations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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
            throw new ApiError(403, "FORBIDDEN", "Only compliance and platform owners can access reviewer operations.");
          }

          const now = new Date().toISOString();
          const todayDate = now.slice(0, 10);

          // Query today daily stats across reviewers
          const allStatsRaw = await fs.query("reviewerDailyStats", { limit: 100 }).catch(() => []);
          const todayStats = allStatsRaw.filter((s) => s["date"] === todayDate);

          // Query pending cases to calculate SLA status
          const allProfilesRaw = await fs.query("kycProfiles", { limit: 500 }).catch(() => []);
          const allProfiles = allProfilesRaw as unknown as KycProfile[];

          let pendingCount = 0;
          let slaBreachedCount = 0;
          let escalatedCount = 0;
          let assignedCount = 0;
          let unassignedCount = 0;

          const reviewerWorkloadMap: Record<string, number> = {};

          for (const p of allProfiles) {
            if (p.kycStatus === "pending") {
              pendingCount++;
              if (isSlaBreached(p.slaDueAt)) {
                slaBreachedCount++;
              }
              if (p.escalatedTo) {
                escalatedCount++;
              }
              if (p.assignedReviewerUid) {
                assignedCount++;
                reviewerWorkloadMap[p.assignedReviewerUid] = (reviewerWorkloadMap[p.assignedReviewerUid] || 0) + 1;
              } else {
                unassignedCount++;
              }
            }
          }

          return Response.json({
            ok: true,
            cannedRejectionReasons: CANNED_REJECTION_REASONS,
            slaOverview: {
              pendingCount,
              slaBreachedCount,
              escalatedCount,
              assignedCount,
              unassignedCount,
              slaTargetHours: 24,
            },
            reviewerWorkload: reviewerWorkloadMap,
            todayReviewerStats: todayStats.map((s) => ({
              reviewerUid: s["reviewerUid"],
              reviewerEmail: s["reviewerEmail"],
              reviewsCompleted: s["reviewsCompleted"] || 0,
              approvals: s["approvals"] || 0,
              rejections: s["rejections"] || 0,
              escalations: s["escalations"] || 0,
              lastActiveAt: s["lastActiveAt"],
            })),
            generatedAt: now,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
