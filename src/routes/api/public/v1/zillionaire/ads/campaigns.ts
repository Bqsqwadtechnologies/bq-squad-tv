import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";

const placements = [
  "pre_roll",
  "mid_roll",
  "half_time",
  "between_segments",
  "home_banner",
  "web_banner",
] as const;
const schema = z
  .object({
    title: z.string().trim().min(2).max(120),
    category: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9_-]+$/),
    ageRating: z.enum(["G", "PG", "PG-13", "16+", "18+", "NR"]),
    adultOnly: z.boolean().default(false),
    platforms: z
      .array(z.enum(["android", "web"]))
      .min(1)
      .max(2),
    placements: z.array(z.enum(placements)).min(1).max(placements.length),
    creativeUrl: z
      .string()
      .url()
      .max(2048)
      .refine((value) => value.startsWith("https://"), "Creative URL must use HTTPS."),
    videoUrl: z
      .string()
      .url()
      .max(2048)
      .optional()
      .refine(
        (value) => value === undefined || value.startsWith("https://"),
        "Video URL must use HTTPS.",
      ),
    territoryCodes: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(250)
      .default([]),
    channelIds: z
      .array(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/))
      .max(100)
      .default([]),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    priority: z.number().int().min(0).max(1000).default(0),
    maxImpressionsPerUserPerDay: z.number().int().min(1).max(100).default(3),
    skipAfterSeconds: z.number().int().min(0).max(300).nullable().default(null),
  })
  .superRefine((value, context) => {
    if (new Set(value.platforms).size !== value.platforms.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platforms"],
        message: "Platforms must be unique.",
      });
    }
    if (new Set(value.placements).size !== value.placements.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["placements"],
        message: "Placements must be unique.",
      });
    }
    if (new Set(value.territoryCodes).size !== value.territoryCodes.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["territoryCodes"],
        message: "Territories must be unique.",
      });
    }
    if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "Campaign end must be after its start.",
      });
    }
    if (value.adultOnly && value.ageRating !== "18+") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ageRating"],
        message: "Adult-only campaigns must be rated 18+.",
      });
    }
  });

export const Route = createFileRoute("/api/public/v1/zillionaire/ads/campaigns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "ads");
          const rows = await fs.query("adCampaigns", {
            orderByField: "createdAt",
            descending: true,
            limit: 100,
          });
          return Response.json(
            rows.map((row) => ({
              id: row.__id,
              title: row["title"] ?? "",
              category: row["category"] ?? "",
              ageRating: row["ageRating"] ?? "NR",
              adultOnly: row["adultOnly"] === true,
              status: row["status"] ?? "DRAFT",
              platforms: row["platforms"] ?? [],
              placements: row["placements"] ?? [],
              territoryCodes: row["territoryCodes"] ?? [],
              channelIds: row["channelIds"] ?? [],
              startsAt: row["startsAt"] ?? null,
              endsAt: row["endsAt"] ?? null,
              priority: row["priority"] ?? 0,
              maxImpressionsPerUserPerDay: row["maxImpressionsPerUserPerDay"] ?? 3,
              createdAt: row["createdAt"] ?? null,
            })),
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "ads");
          await enforceRateLimit(fs, "admin-ad-campaign-create:" + user.uid, {
            limit: 20,
            windowMs: 60_000,
          });
          const id = crypto.randomUUID().replace(/-/g, "");
          const now = new Date().toISOString();
          const campaign = {
            ...body,
            campaignId: id,
            status: "DRAFT",
            impressions: 0,
            createdAt: now,
            updatedAt: now,
            createdBy: user.uid,
            updatedBy: user.uid,
          };
          await fs.setDoc("adCampaigns/" + id, campaign, { mustNotExist: true });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "ads.campaign_created",
            targetType: "adCampaign",
            targetId: id,
            reason: "Owner created a draft advertising campaign",
            metadata: {
              platforms: body.platforms,
              placements: body.placements,
              adultOnly: body.adultOnly,
              territoryCount: body.territoryCodes.length,
              priority: body.priority,
            },
          });
          return Response.json({ created: true, campaignId: id, status: "DRAFT" }, { status: 201 });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
