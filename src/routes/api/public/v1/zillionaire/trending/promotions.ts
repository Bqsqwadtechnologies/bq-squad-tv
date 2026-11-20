import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

const createPromoSchema = z.object({
  targetType: z.enum(["channel", "movie", "series"]),
  targetId: z.string().min(1),
  title: z.string().min(1),
  category: z.string().default("Entertainment"),
  posterUrl: z.string().url().nullable().optional(),
  packageId: z.string().default("pkg_boost_24h"),
  durationHours: z.number().int().min(1).default(24),
  startsAt: z.string().optional(),
});

const updatePromoSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  notes: z.string().default(""),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/trending/promotions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "catalog");

          const promotions = await fs.query("trendingPromotions", {
            limit: 100,
          });

          return Response.json({ promotions });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "catalog");

          const body = await parseBody(request, createPromoSchema);
          const id = "promo_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
          const now = Date.now();
          const startMs = body.startsAt ? Date.parse(body.startsAt) : now;
          const endMs = startMs + body.durationHours * 3600 * 1000;

          const promo = {
            id,
            targetType: body.targetType,
            targetId: body.targetId,
            title: body.title,
            category: body.category,
            posterUrl: body.posterUrl ?? null,
            packageId: body.packageId,
            status: "ACTIVE",
            startsAt: new Date(startMs).toISOString(),
            endsAt: new Date(endMs).toISOString(),
            impressions: 0,
            clicks: 0,
            watchMinutesGained: 0,
            approvedBy: user.uid,
            createdAt: new Date().toISOString(),
          };

          await fs.setDoc("trendingPromotions/" + id, promo);

          const auditId = crypto.randomUUID();
          await fs.setDoc("auditLog/" + auditId, {
            actorUid: user.uid,
            action: "trending.promotion_created",
            promotionId: id,
            targetId: body.targetId,
            createdAt: new Date().toISOString(),
          });

          return Response.json({ success: true, promotion: promo }, { status: 201 });
        } catch (error) {
          return errorBody(error);
        }
      },
      PATCH: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "catalog");

          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (!id) throw new ApiError(400, "MISSING_ID", "Promotion ID is required.");

          const promo = await fs.getDoc("trendingPromotions/" + id);
          if (!promo) throw new ApiError(404, "PROMO_NOT_FOUND", "Promotion not found.");

          const body = await parseBody(request, updatePromoSchema);
          const newStatus =
            body.action === "approve"
              ? "ACTIVE"
              : body.action === "reject"
                ? "REJECTED"
                : "CANCELLED";

          await fs.updateDoc("trendingPromotions/" + id, {
            status: newStatus,
            reviewNotes: body.notes,
            reviewedBy: user.uid,
            updatedAt: new Date().toISOString(),
          });

          return Response.json({ success: true, status: newStatus });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
