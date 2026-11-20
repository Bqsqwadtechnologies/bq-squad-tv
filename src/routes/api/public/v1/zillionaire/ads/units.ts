import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const unitTypes = ["banner", "interstitial", "rewarded", "native", "pre_roll"] as const;
const platforms = ["web", "android"] as const;
const placements = [
  "home_row",
  "below_player",
  "between_episodes",
  "exit_screen",
  "wallet_topup",
] as const;

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE"),
    name: z.string().trim().min(2).max(100),
    platform: z.enum(platforms),
    type: z.enum(unitTypes),
    placement: z.enum(placements),
    size: z.string().max(50).default("responsive"),
    frequencyCap: z.number().int().min(1).max(100).default(3),
    priority: z.number().int().min(0).max(1000).default(0),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    targetCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).default([]),
    targetChannels: z.array(z.string()).default([]),
    targetAgeRating: z.enum(["all", "G", "PG", "PG-13", "16+", "18+"]).default("all"),
    targetAudience: z.enum(["all", "new", "returning"]).default("all"),
    enabled: z.boolean().default(true),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("UPDATE"),
    unitId: z.string().min(1).max(100),
    name: z.string().trim().min(2).max(100).optional(),
    placement: z.enum(placements).optional(),
    size: z.string().max(50).optional(),
    frequencyCap: z.number().int().min(1).max(100).optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    targetCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).optional(),
    targetChannels: z.array(z.string()).optional(),
    targetAgeRating: z.enum(["all", "G", "PG", "PG-13", "16+", "18+"]).optional(),
    targetAudience: z.enum(["all", "new", "returning"]).optional(),
    enabled: z.boolean().optional(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("DELETE"),
    unitId: z.string().min(1).max(100),
    reason: z.string().trim().min(3).max(1000),
  }),
]);

export const Route = createFileRoute("/api/public/v1/zillionaire/ads/units")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "ads");
          const url = new URL(request.url);
          const platform = url.searchParams.get("platform");

          const filters: Array<{ field: string; op: "EQUAL"; value: unknown }> = [];
          if (platform === "web" || platform === "android") {
            filters.push({ field: "platform", op: "EQUAL", value: platform });
          }

          const docs = await fs.query("adUnits", {
            ...(filters.length > 0 ? { filters } : {}),
            limit: 200,
          }).catch(() => []);

          const units = docs.map((d) => ({
            id: d.__id,
            name: String(d["name"] || "Untitled Unit"),
            platform: d["platform"] === "android" ? "android" : "web",
            type: d["type"] || "banner",
            placement: d["placement"] || "home_row",
            size: d["size"] || "responsive",
            frequencyCap: Number(d["frequencyCap"] || 3),
            priority: Number(d["priority"] || 0),
            startsAt: d["startsAt"] || null,
            endsAt: d["endsAt"] || null,
            targetCountries: Array.isArray(d["targetCountries"]) ? d["targetCountries"] : [],
            targetChannels: Array.isArray(d["targetChannels"]) ? d["targetChannels"] : [],
            targetAgeRating: d["targetAgeRating"] || "all",
            targetAudience: d["targetAudience"] || "all",
            enabled: d["enabled"] !== false,
            createdAt: d["createdAt"] || new Date().toISOString(),
          }));

          return Response.json({ units });
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

          if (body.action === "CREATE") {
            const unitId = "unit-" + crypto.randomUUID().slice(0, 8);
            const record = {
              id: unitId,
              name: body.name,
              platform: body.platform,
              type: body.type,
              placement: body.placement,
              size: body.size,
              frequencyCap: body.frequencyCap,
              priority: body.priority,
              startsAt: body.startsAt || null,
              endsAt: body.endsAt || null,
              targetCountries: body.targetCountries,
              targetChannels: body.targetChannels,
              targetAgeRating: body.targetAgeRating,
              targetAudience: body.targetAudience,
              enabled: body.enabled,
              createdAt: now,
              createdBy: user.uid,
            };
            await fs.setDoc(`adUnits/${unitId}`, record, { mustNotExist: true });
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "ads.unit_create",
              targetType: "ad_unit",
              targetId: unitId,
              reason: body.reason,
              after: record,
            });
            return Response.json({ success: true, unit: record });
          } else if (body.action === "UPDATE") {
            const existing = await fs.getDoc(`adUnits/${body.unitId}`);
            if (!existing) throw new ApiError(404, "UNIT_NOT_FOUND", "Ad unit does not exist.");
            const updates: Record<string, unknown> = { updatedAt: now, updatedBy: user.uid };
            if (body.name !== undefined) updates["name"] = body.name;
            if (body.placement !== undefined) updates["placement"] = body.placement;
            if (body.size !== undefined) updates["size"] = body.size;
            if (body.frequencyCap !== undefined) updates["frequencyCap"] = body.frequencyCap;
            if (body.priority !== undefined) updates["priority"] = body.priority;
            if (body.startsAt !== undefined) updates["startsAt"] = body.startsAt;
            if (body.endsAt !== undefined) updates["endsAt"] = body.endsAt;
            if (body.targetCountries !== undefined) updates["targetCountries"] = body.targetCountries;
            if (body.targetChannels !== undefined) updates["targetChannels"] = body.targetChannels;
            if (body.targetAgeRating !== undefined) updates["targetAgeRating"] = body.targetAgeRating;
            if (body.targetAudience !== undefined) updates["targetAudience"] = body.targetAudience;
            if (body.enabled !== undefined) updates["enabled"] = body.enabled;

            await fs.patchDoc(`adUnits/${body.unitId}`, updates);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "ads.unit_update",
              targetType: "ad_unit",
              targetId: body.unitId,
              reason: body.reason,
              before: existing,
              after: updates,
            });
            return Response.json({ success: true, unitId: body.unitId });
          } else {
            const existing = await fs.getDoc(`adUnits/${body.unitId}`);
            if (!existing) throw new ApiError(404, "UNIT_NOT_FOUND", "Ad unit does not exist.");
            await fs.deleteDoc(`adUnits/${body.unitId}`);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "ads.unit_delete",
              targetType: "ad_unit",
              targetId: body.unitId,
              reason: body.reason,
              before: existing,
            });
            return Response.json({ success: true, unitId: body.unitId });
          }
        } catch (e) {
          return errorBody(e);
        }
      },
    },
  },
});
