import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  enabled: z.boolean(),
  monthlyPriceMinor: z.number().int().min(1).max(100_000_000),
  currency: z.enum(["NGN", "USD", "GHS", "ZAR", "KES", "XOF"]),
  reason: z.string().trim().min(3).max(1000),
}).strict();

const DEFAULT_CONFIG = { enabled: false, monthlyPriceMinor: 0, currency: "NGN" as const };

export const Route = createFileRoute("/api/public/v1/zillionaire/config/producer-blue-tick")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the Zillionaire owner can configure public verification pricing.");
          const saved = await fs.getDoc("config/producerBlueTick");
          return Response.json({
            config: {
              enabled: saved?.["enabled"] === true,
              monthlyPriceMinor: Number.isSafeInteger(saved?.["monthlyPriceMinor"]) ? saved?.["monthlyPriceMinor"] : DEFAULT_CONFIG.monthlyPriceMinor,
              currency: typeof saved?.["currency"] === "string" ? saved["currency"] : DEFAULT_CONFIG.currency,
            },
          }, { headers: { "cache-control": "no-store" } });
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
          if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the Zillionaire owner can configure public verification pricing.");
          const before = await fs.getDoc("config/producerBlueTick");
          const next = {
            enabled: body.enabled,
            monthlyPriceMinor: body.monthlyPriceMinor,
            currency: body.currency,
            updatedAt: new Date().toISOString(),
            updatedBy: user.uid,
            version: (Number(before?.["version"]) || 0) + 1,
          };
          await fs.setDoc("config/producerBlueTick", next);
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "producer.public_verification_pricing_updated",
            targetType: "platform_config",
            targetId: "config/producerBlueTick",
            reason: body.reason,
            before: before || {},
            after: next,
          });
          return Response.json({ saved: true, config: next }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
