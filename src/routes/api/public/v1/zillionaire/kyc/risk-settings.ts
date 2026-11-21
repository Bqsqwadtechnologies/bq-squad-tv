import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { getKycRiskSettings, updateKycRiskSettings, type KycRiskSettings } from "@/lib/server/kyc/risk-settings";

const patchSchema = z.object({
  tier1CumulativeLimitUsdMinor: z.number().int().positive().optional(),
  tier1CumulativeLimitNgnMinor: z.number().int().positive().optional(),
  highRiskThresholdScore: z.number().int().min(1).max(100).optional(),
  fourEyesRequiredForHighRisk: z.boolean().optional(),
  reason: z.string().min(3).max(500),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/risk-settings")({
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
              ["security", "compliance", "payouts", "finance"].includes(m),
            );

          if (!hasAccess) {
            throw new ApiError(403, "FORBIDDEN", "Compliance, security, or platform owner role required.");
          }

          const settings = await getKycRiskSettings(fs);
          return Response.json(
            { ok: true, settings },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },

      PATCH: async ({ request }) => {
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
              ["security", "compliance", "payouts", "finance"].includes(m),
            );

          if (!hasAccess) {
            throw new ApiError(403, "FORBIDDEN", "Compliance, security, or platform owner role required.");
          }

          const body = await parseBody(request, patchSchema);
          const updates: Partial<KycRiskSettings> = {};
          if (body.tier1CumulativeLimitUsdMinor !== undefined) updates.tier1CumulativeLimitUsdMinor = body.tier1CumulativeLimitUsdMinor;
          if (body.tier1CumulativeLimitNgnMinor !== undefined) updates.tier1CumulativeLimitNgnMinor = body.tier1CumulativeLimitNgnMinor;
          if (body.highRiskThresholdScore !== undefined) updates.highRiskThresholdScore = body.highRiskThresholdScore;
          if (body.fourEyesRequiredForHighRisk !== undefined) updates.fourEyesRequiredForHighRisk = body.fourEyesRequiredForHighRisk;

          const updated = await updateKycRiskSettings(
            fs,
            updates,
            { uid: user.uid, ...(user.email ? { email: user.email } : {}) },
            body.reason,
          );

          return Response.json(
            { ok: true, settings: updated },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
