import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  paidViewersAdFree: z.boolean(),
  kidsProtectionEnabled: z.boolean().default(true),
  adultChannelRestricted: z.boolean().default(true),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/ads/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "ads");
          const doc = await fs.getDoc("config/adSettings");
          return Response.json({
            paidViewersAdFree: doc?.["paidViewersAdFree"] === true,
            kidsProtectionEnabled: doc?.["kidsProtectionEnabled"] !== false,
            adultChannelRestricted: doc?.["adultChannelRestricted"] !== false,
            updatedAt: doc?.["updatedAt"] || null,
          });
        } catch (e) {
          return errorBody(e);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "ads");
          const now = new Date().toISOString();
          const record = {
            paidViewersAdFree: body.paidViewersAdFree,
            kidsProtectionEnabled: body.kidsProtectionEnabled,
            adultChannelRestricted: body.adultChannelRestricted,
            updatedAt: now,
            updatedBy: user.uid,
          };
          await fs.setDoc("config/adSettings", record);
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "ads.settings_update",
            targetType: "config",
            targetId: "adSettings",
            reason: body.reason,
            after: record,
          });
          return Response.json({ success: true, settings: record });
        } catch (e) {
          return errorBody(e);
        }
      },
    },
  },
});
