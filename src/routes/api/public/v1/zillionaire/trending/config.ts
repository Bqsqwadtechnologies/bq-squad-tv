import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { DEFAULT_TRENDING_CONFIG, getTrendingConfig } from "@/lib/server/trending";

const schema = z.object({
  weightConcurrent: z.number().min(0).max(1).default(0.5),
  weightWatchMinutes: z.number().min(0).max(1).default(0.3),
  weightUniqueViewers: z.number().min(0).max(1).default(0.2),
  weightCompletion: z.number().min(0).max(1).default(0.1),
  weightRecency: z.number().min(0).max(1).default(0.1),
  maxPromotedShare: z.number().min(0.05).max(0.5).default(0.25),
  minWatchSeconds: z.number().int().min(10).max(300).default(30),
  packages: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      durationHours: z.number().int().min(1),
      priceMinor: z.number().int().min(100),
      currency: z.string().min(3).max(3),
      description: z.string().default(""),
    }),
  ).optional(),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/trending/config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "catalog");
          const config = await getTrendingConfig(fs);
          return Response.json(config);
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "catalog");
          const body = await parseBody(request, schema);

          const updated = {
            ...body,
            packages: body.packages ?? DEFAULT_TRENDING_CONFIG.packages,
            updatedAt: new Date().toISOString(),
            updatedBy: user.uid,
          };

          await fs.setDoc("platformSettings/trendingConfig", updated);

          const auditId = crypto.randomUUID();
          await fs.setDoc("auditLog/" + auditId, {
            actorUid: user.uid,
            action: "trending.config_updated",
            details: updated,
            createdAt: new Date().toISOString(),
          });

          return Response.json({ success: true, config: updated });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
