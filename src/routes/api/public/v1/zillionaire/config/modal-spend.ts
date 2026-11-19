import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { getModalSpendSnapshot } from "@/lib/server/modal-spend";

const schema = z
  .object({
    monthlyLimitUsd: z.number().finite().min(1).max(1000),
    override: z.boolean(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/zillionaire/config/modal-spend")({
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
              "This setting is only available in the Zillionaire dashboard.",
            );
          return Response.json(await getModalSpendSnapshot(fs), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      PUT: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner)
            throw new ApiError(
              403,
              "OWNER_ONLY",
              "This setting is only available in the Zillionaire dashboard.",
            );
          const before = await fs.getDoc("config/modalSpend");
          const now = new Date().toISOString();
          await fs.patchDoc("config/modalSpend", {
            monthlyLimitUsd: body.monthlyLimitUsd,
            override: body.override,
            updatedAt: now,
            updatedBy: user.uid,
            reason: body.reason,
          });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "video.modal_spend_settings_updated",
            targetType: "platform_config",
            targetId: "config/modalSpend",
            reason: body.reason,
            before,
            after: { monthlyLimitUsd: body.monthlyLimitUsd, override: body.override },
          });
          return Response.json(
            { saved: true, ...(await getModalSpendSnapshot(fs)) },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
