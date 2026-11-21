import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { DEFAULT_PAYOUT_RULES, getPayoutRules } from "@/lib/server/payouts/rules";

const updateRulesSchema = z.object({
  minimumPayoutUSDMinor: z.number().int().min(1000).max(10000000), // $10 to $100,000
  minimumPayoutNGNMinor: z.number().int().min(1000000).max(10000000000), // ₦10,000 to ₦100,000,000
  usdToNgnRate: z.number().positive().min(100).max(10000), // exchange rate 100 to 10,000
  dualApprovalThresholdUSDMinor: z.number().int().min(10000).max(100000000), // $100 to $1,000,000
  dualApprovalThresholdNGNMinor: z.number().int().min(10000000).max(100000000000),
  stepUpThresholdUSDMinor: z.number().int().min(10000).max(100000000),
  stepUpThresholdNGNMinor: z.number().int().min(10000000).max(100000000000),
  reason: z.string().trim().min(3).max(500),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/payouts/rules")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "payouts");

          const rules = await getPayoutRules(fs);
          return Response.json({ rules });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "payouts");
          const body = await parseBody(request, updateRulesSchema);

          const now = new Date().toISOString();
          const rulesData = {
            minimumPayoutUSDMinor: body.minimumPayoutUSDMinor,
            minimumPayoutNGNMinor: body.minimumPayoutNGNMinor,
            usdToNgnRate: body.usdToNgnRate,
            dualApprovalThresholdUSDMinor: body.dualApprovalThresholdUSDMinor,
            dualApprovalThresholdNGNMinor: body.dualApprovalThresholdNGNMinor,
            stepUpThresholdUSDMinor: body.stepUpThresholdUSDMinor,
            stepUpThresholdNGNMinor: body.stepUpThresholdNGNMinor,
            updatedAt: now,
            updatedBy: actor.uid,
            updateReason: body.reason,
          };

          await fs.setDoc("platformSettings/payouts", encodeFields(rulesData));

          await writeAuditLog(fs, {
            actorUid: actor.uid,
            action: "payout.rules.updated",
            targetType: "settings",
            targetId: "platformSettings/payouts",
            reason: body.reason,
            metadata: {
              minimumPayoutUSDMinor: body.minimumPayoutUSDMinor,
              minimumPayoutNGNMinor: body.minimumPayoutNGNMinor,
              usdToNgnRate: body.usdToNgnRate,
              dualApprovalThresholdUSDMinor: body.dualApprovalThresholdUSDMinor,
            },
          });

          return Response.json({ success: true, rules: rulesData });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
