import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const keys = [
  "effective_date",
  "last_updated",
  "minimum_age",
  "viewing_history_retention",
  "evidence_retention",
  "security_log_retention",
  "dispute_window_days",
  "wallet_refund_rule",
  "closure_balance_rule",
  "liability_period_months",
  "governing_law",
  "jurisdiction",
  "postal_address_if_required",
  "revenue_basis",
  "revenue_change_notice_days",
  "minimum_payout",
] as const;
const schema = z
  .object({
    values: z.record(z.string(), z.string().trim().max(1000)),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict()
  .superRefine((value, context) => {
    for (const key of Object.keys(value.values)) {
      if (!(keys as readonly string[]).includes(key))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["values", key],
          message: "Unknown legal setting.",
        });
    }
  });

export const Route = createFileRoute("/api/public/v1/zillionaire/pages/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner)
            throw new ApiError(
              403,
              "OWNER_ONLY",
              "Only the signed-in owner can view legal settings.",
            );
          const config = await fs.getDoc("platformConfig/legalSettings");
          return Response.json({ values: config?.["values"] ?? {}, keys });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner)
            throw new ApiError(
              403,
              "OWNER_ONLY",
              "Only the signed-in owner can change legal settings.",
            );
          const previous = await fs.getDoc("platformConfig/legalSettings");
          const values = {
            ...(previous?.["values"] && typeof previous["values"] === "object"
              ? (previous["values"] as Record<string, unknown>)
              : {}),
            ...body.values,
          };
          await fs.patchDoc("platformConfig/legalSettings", {
            values,
            updatedAt: new Date().toISOString(),
            updatedBy: user.uid,
          });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "legal.settings_updated",
            targetType: "legalSettings",
            targetId: "platformConfig/legalSettings",
            reason: body.reason,
            metadata: { updatedKeys: Object.keys(body.values) },
          });
          return Response.json({ saved: true, values });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
