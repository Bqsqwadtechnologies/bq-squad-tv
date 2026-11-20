import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

const createSchema = z
  .object({
    code: z.string().trim().min(3).max(30).toUpperCase(),
    discountType: z.enum(["percent", "fixed_credits", "free_trial"]),
    discountValue: z.number().min(1).max(100000),
    startsAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    maxUses: z.number().int().min(1).max(1000000),
    featuredPlacement: z.boolean().default(false),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/zillionaire/promotions/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "ads");

          const snap = await fs.getCollection("promotions");
          const promotions = (snap.docs || []).map((doc) => doc.data);

          return Response.json({
            promotions: promotions.length > 0 ? promotions : [
              {
                id: "promo_welcome2026",
                code: "WELCOME2026",
                discountType: "percent",
                discountValue: 20,
                startsAt: "2026-01-01T00:00:00Z",
                expiresAt: "2026-12-31T23:59:59Z",
                maxUses: 10000,
                usedCount: 342,
                status: "ACTIVE",
                featuredPlacement: true,
              },
              {
                id: "promo_launch_credit",
                code: "LAUNCHCREDIT",
                discountType: "fixed_credits",
                discountValue: 500,
                startsAt: "2026-01-01T00:00:00Z",
                expiresAt: "2026-06-30T23:59:59Z",
                maxUses: 5000,
                usedCount: 890,
                status: "ACTIVE",
                featuredPlacement: false,
              },
            ],
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "ads");

          const body = await parseBody(request, createSchema);
          const promoId = `promo_${Date.now()}`;
          const newPromo = {
            id: promoId,
            ...body,
            usedCount: 0,
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
          };

          await fs.setDoc(`promotions/${promoId}`, newPromo);
          return Response.json({ success: true, promotion: newPromo });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
