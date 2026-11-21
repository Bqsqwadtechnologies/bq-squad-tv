import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const topupSchema = z.object({
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  creditMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
});

const playProductSchema = z
  .object({
    productId: z.string().regex(/^[A-Za-z0-9._-]{1,150}$/),
    title: z.string().min(1).max(100),
    description: z.string().max(300).default(""),
    credits: z.number().int().positive().max(1_000_000),
    creditMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    creditMinorByCurrency: z
      .record(
        z.string().regex(/^[A-Z]{3}$/),
        z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      )
      .optional(),
    active: z.boolean().default(true),
  })
  .superRefine((product, context) => {
    if (
      product.creditMinor === undefined &&
      (!product.creditMinorByCurrency || Object.keys(product.creditMinorByCurrency).length === 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["creditMinorByCurrency"],
        message: "Provide a credit value for at least one wallet currency.",
      });
    }
  });

const promoWindowSchema = z.object({
  id: z.string().min(1).max(100),
  targetType: z.enum(["movie", "series", "episode", "channel", "live_stream", "category", "global"]),
  targetId: z.string().max(120).optional(),
  overrideRateMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  discountPercent: z.number().int().min(1).max(100).optional(),
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
  label: z.string().min(1).max(120),
  active: z.boolean().default(true),
});

const bundleSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(120),
  description: z.string().max(500).default(""),
  assetIds: z.array(z.string().min(1).max(120)).min(1).max(100),
  priceMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/),
  durationDays: z.number().int().positive().max(365),
  active: z.boolean().default(true),
});

const rateRecordSchema = z.record(
  z.string().regex(/^[A-Z]{3}$/),
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
);

const schema = z.object({
  defaultRatePerMinuteMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  minimumSessionBalanceMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  defaultProducerShareBps: z.number().int().min(0).max(10_000),
  maxConcurrentSessions: z.number().int().min(1).max(5).default(2),
  walletTopups: z.record(z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), topupSchema).default({}),
  walletTopupsByCurrency: z
    .record(
      z.string().regex(/^[A-Z]{3}$/),
      z.record(z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), topupSchema),
    )
    .default({}),
  defaultRatePerMinuteByCurrency: z
    .record(
      z.string().regex(/^[A-Z]{3}$/),
      z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    )
    .default({}),
  minimumSessionBalanceByCurrency: z
    .record(
      z.string().regex(/^[A-Z]{3}$/),
      z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    )
    .default({}),
  // Owner-controlled price overrides (all amounts in integer minor currency units, 0 = Free)
  channelRatesById: z
    .record(
      z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
      rateRecordSchema,
    )
    .default({}),
  assetRatesById: z
    .record(
      z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
      rateRecordSchema,
    )
    .default({}),
  seriesRatesById: z
    .record(
      z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
      rateRecordSchema,
    )
    .default({}),
  episodeRatesById: z
    .record(
      z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
      rateRecordSchema,
    )
    .default({}),
  categoryRatesById: z
    .record(
      z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
      rateRecordSchema,
    )
    .default({}),
  liveStreamRatesById: z
    .record(
      z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
      rateRecordSchema,
    )
    .default({}),
  promoPricingWindows: z.array(promoWindowSchema).max(50).default([]),
  bundles: z.array(bundleSchema).max(50).default([]),
  producerShareBpsByChannel: z
    .record(z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), z.number().int().min(0).max(10_000))
    .default({}),
  dailySpendLimitByCurrency: z
    .record(
      z.string().regex(/^[A-Z]{3}$/),
      z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    )
    .default({}),
  googlePlayProducts: z.array(playProductSchema).max(100).default([]),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/config/pricing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "pricing");
          
          const url = new URL(request.url);
          if (url.searchParams.get("history") === "true") {
            const historyDocs = await fs.query("pricing_history", { limit: 50 });
            return Response.json({
              history: historyDocs.map((d) => ({
                id: String(d["id"] || d.__id || ""),
                version: d["version"],
                savedAt: d["savedAt"],
                savedBy: d["savedBy"],
                summary: d["summary"] ?? `Pricing version ${d["version"]}`,
              })),
            });
          }

          const config = await fs.getDoc("config/pricing");
          if (!config)
            throw new ApiError(404, "PRICING_NOT_CONFIGURED", "Pricing has not been configured.");
          return Response.json(config);
        } catch (error) {
          return errorBody(error);
        }
      },
      PUT: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "pricing");
          const now = new Date().toISOString();
          const version = await fs.transact(["config/pricing"], (docs) => {
            const current = docs[0];
            const currentVersion = current?.["version"] === undefined ? 0 : current["version"];
            if (
              typeof currentVersion !== "number" ||
              !Number.isSafeInteger(currentVersion) ||
              currentVersion < 0
            ) {
              throw new ApiError(
                409,
                "PRICING_VERSION_INVALID",
                "The existing pricing version is invalid.",
              );
            }
            const nextVersion = currentVersion + 1;
            return {
              result: nextVersion,
              writes: [
                {
                  update: {
                    name: fs.docName("config/pricing"),
                    fields: encodeFields({
                      ...body,
                      version: nextVersion,
                      updatedAt: now,
                      updatedBy: user.uid,
                    }),
                  },
                },
              ],
            };
          });

          // Save audit snapshot to history
          try {
            await fs.createDoc(`pricing_history/v${version}`, {
              version,
              savedAt: now,
              savedBy: user.uid,
              summary: `Updated version ${version}: ${Object.keys(body.assetRatesById).length} titles, ${Object.keys(body.channelRatesById).length} channels, ${body.promoPricingWindows.length} promos, ${body.bundles.length} bundles.`,
              snapshot: body,
            });
          } catch {
            // Ignore snapshot write failure if doc exists
          }

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "pricing.updated",
            targetType: "pricing",
            targetId: "config/pricing",
            reason: "Platform owner updated versioned pricing",
            metadata: {
              version,
              maxConcurrentSessions: body.maxConcurrentSessions,
              walletTopupCount: Object.keys(body.walletTopups ?? {}).length,
              walletTopupCurrencyCount: Object.keys(body.walletTopupsByCurrency ?? {}).length,
              googlePlayProductCount: body.googlePlayProducts.length,
              assetRatesCount: Object.keys(body.assetRatesById).length,
              channelRatesCount: Object.keys(body.channelRatesById).length,
              promoCount: body.promoPricingWindows.length,
              bundleCount: body.bundles.length,
            },
          });
          return Response.json({ saved: true, version });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
