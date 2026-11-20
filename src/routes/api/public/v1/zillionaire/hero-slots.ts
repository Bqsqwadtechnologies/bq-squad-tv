import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { type HeroSlot } from "@/lib/server/trending";

const schema = z.object({
  slots: z.array(
    z.object({
      id: z.string().min(1),
      targetType: z.enum(["title", "series", "channel"]),
      targetId: z.string().min(1),
      title: z.string().min(1),
      subtitle: z.string().optional(),
      artworkUrl: z.string().url(),
      ctaLabel: z.string().min(1).default("Watch Now"),
      startAt: z.string(),
      endAt: z.string(),
      countries: z.array(z.string()).optional(),
      audience: z.enum(["all", "adult", "kids"]).default("all"),
      order: z.number().int().default(1),
      active: z.boolean().default(true),
    }),
  ),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/hero-slots")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "catalog");
          const doc = await fs.getDoc("platformSettings/heroSlots");
          const slots: HeroSlot[] = (doc && Array.isArray(doc["slots"])) ? (doc["slots"] as HeroSlot[]) : [];
          return Response.json({ slots });
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

          const orderedSlots = body.slots.sort((a, b) => a.order - b.order);
          await fs.setDoc("platformSettings/heroSlots", {
            slots: orderedSlots,
            updatedAt: new Date().toISOString(),
            updatedBy: user.uid,
          });

          const auditId = crypto.randomUUID();
          await fs.setDoc("auditLog/" + auditId, {
            actorUid: user.uid,
            action: "hero_slots.updated",
            slotCount: orderedSlots.length,
            createdAt: new Date().toISOString(),
          });

          return Response.json({ success: true, slots: orderedSlots });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
