import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getPricingConfig, requireMinorUnitAmount } from "@/lib/server/pricing";
import { writeAuditLog } from "@/lib/server/audit";
import { requireCurrency } from "@/lib/server/currency";
import { generateChannelId, slugifyChannelTitle } from "@/lib/server/universal-ids";
import { requireCompanyEmail } from "@/lib/server/company-email";

const schema = z
  .object({
    title: z.string().trim().min(2).max(100),
    category: z.string().trim().min(2).max(60),
    description: z.string().trim().max(3000).default(""),
    customSlug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/).optional(),
    partnerEmail: z.string().trim().email().optional(),
    partnerCompanyName: z.string().trim().max(100).optional(),
    partnerRole: z.enum(["Manager", "Editor", "Viewer"]).optional(),
    revenueShareBps: z.number().int().min(0).max(10000).optional(),
    language: z.string().trim().min(2).max(20).default("en"),
    contentRating: z.enum(["G", "PG", "13+", "16+", "18+"]).default("G"),
    adultOnly: z.boolean().default(false),
    paid: z.boolean().default(false),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("USD"),
    ratePerMinuteMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    ratePerMinuteByCurrency: z
      .record(
        z.string().regex(/^[A-Z]{3}$/),
        z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      )
      .optional(),
    minimumBalanceMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    minimumBalanceByCurrency: z
      .record(
        z.string().regex(/^[A-Z]{3}$/),
        z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      )
      .optional(),
    reason: z.string().trim().min(3).max(1000),
  })
  .superRefine((value, context) => {
    if (value.adultOnly && value.contentRating !== "18+")
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentRating"],
        message: "Adult-only channels must use the 18+ rating.",
      });
    if (!value.adultOnly && value.contentRating === "18+")
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adultOnly"],
        message: "An 18+ channel must be explicitly marked adult-only.",
      });
    const hasCurrencyRates = Boolean(
      value.ratePerMinuteByCurrency && Object.keys(value.ratePerMinuteByCurrency).length > 0,
    );
    if (
      value.paid &&
      !hasCurrencyRates &&
      (!Number.isSafeInteger(value.ratePerMinuteMinor) || (value.ratePerMinuteMinor ?? 0) < 1)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ratePerMinuteMinor"],
        message: "Paid channels require a positive per-minute price or currency-specific prices.",
      });
    if (
      !value.paid &&
      ((value.ratePerMinuteMinor !== undefined && value.ratePerMinuteMinor !== 0) ||
        hasCurrencyRates)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ratePerMinuteMinor"],
        message: "Free channels must not have paid per-minute prices.",
      });
  });

export const Route = createFileRoute("/api/public/v1/zillionaire/channels")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          try {
            await requireZillionaireModule(fs, user, "content");
          } catch {
            await requireZillionaireModule(fs, user, "channels");
          }
          const channels = await fs.query("channels", {
            filters: [{ field: "ownerUid", op: "EQUAL", value: "platform" }],
            limit: 200,
          });
          return Response.json({
            channels: channels.map((channel) => ({
              id: channel.__id,
              channelId: channel["channelId"] || channel.__id,
              slug: channel["slug"] || null,
              title: typeof channel["title"] === "string" ? channel["title"] : "Untitled channel",
              status: typeof channel["status"] === "string" ? channel["status"] : "DRAFT",
              published: channel["published"] === true,
              partnerEmail: channel["partnerEmail"] || null,
              partnerRole: channel["partnerRole"] || null,
            })),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "channels");
          await enforceRateLimit(fs, "platform-channel-create:" + user.uid, {
            limit: 30,
            windowMs: 60 * 60_000,
          });

          let validatedPartnerEmail: string | null = null;
          if (body.partnerEmail) {
            validatedPartnerEmail = requireCompanyEmail(body.partnerEmail, "Channel Partner");
          }
          const pricing = await getPricingConfig(fs);
          const currency = requireCurrency(body.currency);
          const ratePerMinuteByCurrency = body.paid ? (body.ratePerMinuteByCurrency ?? {}) : {};
          const ratePerMinuteMinor = body.paid
            ? requireMinorUnitAmount(
                body.ratePerMinuteMinor ?? ratePerMinuteByCurrency[currency] ?? 0,
                "ratePerMinuteMinor",
              )
            : 0;
          const minimumBalanceByCurrency = body.minimumBalanceByCurrency ?? {};
          const minimumBalanceMinor =
            body.minimumBalanceMinor ??
            minimumBalanceByCurrency[currency] ??
            (body.paid
              ? requireMinorUnitAmount(
                  pricing["minimumSessionBalanceMinor"] ?? 0,
                  "minimumSessionBalanceMinor",
                )
              : 0);

          let channelId = "";
          let slug = "";
          let created = false;

          for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
            channelId = generateChannelId();
            const baseSlug = body.customSlug || slugifyChannelTitle(body.title);
            slug = body.customSlug || `${baseSlug}-${channelId.slice(-4).toLowerCase()}`;
            const now = new Date().toISOString();

            // Ensure slug is not already taken
            const existingSlug = await fs.getDoc("channelSlugs/" + slug);
            if (existingSlug) {
              continue;
            }

            const fields = {
              channelId,
              slug,
              channelNumber: channelId,
              ownerUid: "platform",
              createdBy: user.uid,
              title: body.title,
              category: body.category,
              description: body.description,
              language: body.language,
              contentRating: body.contentRating,
              adultOnly: body.adultOnly,
              paid: body.paid,
              currency,
              ratePerMinuteMinor,
              ratePerMinuteByCurrency,
              minimumBalanceMinor,
              minimumBalanceByCurrency,
              partnerEmail: validatedPartnerEmail || null,
              partnerRole: body.partnerRole || null,
              revenueShareBps: body.revenueShareBps ?? 0,
              producerShareBps: body.revenueShareBps ?? 0,
              published: false,
              status: "DRAFT",
              deliveryMode: "bq_hosted",
              providerId: "bq-storage",
              providerSetupStatus: "AWAITING_CONTENT",
              currentAssetId: null,
              logoPath: null,
              bannerPath: null,
              pricingVersion: pricing.version,
              createdAt: now,
              updatedAt: now,
            };

            const result = await fs.transact(["channels/" + channelId], (docs) => {
              if (docs[0]) return { result: false, writes: [] };
              return {
                result: true,
                writes: [
                  {
                    update: {
                      name: fs.docName("channels/" + channelId),
                      fields: encodeFields(fields),
                    },
                    currentDocument: { exists: false },
                  },
                ],
              };
            });
            created = result;
          }

          if (!created)
            throw new ApiError(
              503,
              "CHANNEL_ID_GENERATION_FAILED",
              "A unique channel identifier could not be allocated. Please retry.",
            );

          const now = new Date().toISOString();
          // Index slug and public ID
          await fs.setDoc("channelSlugs/" + slug, {
            slug,
            channelId,
            createdAt: now,
          });
          await fs.setDoc("publicIds/" + channelId, {
            id: channelId,
            type: "channel",
            slug,
            createdAt: now,
          });

          // Partner assignment is an invitation only. It must not activate a provider account,
          // add a provider role, or create an approved-provider record based on an email match.
          if (validatedPartnerEmail) {
            const partnerOrgId = `partner_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
            await fs.setDoc(`providerInvitations/${channelId}`, {
              invitationId: channelId,
              email: validatedPartnerEmail,
              providerId: partnerOrgId,
              companyName: body.partnerCompanyName || "Partner Company",
              role: body.partnerRole || "Manager",
              channelId,
              channelSlug: slug,
              status: "pending_acceptance",
              requiresEmailVerification: true,
              requiresExplicitAcceptance: true,
              invitedBy: user.uid,
              createdAt: now,
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
            });
          }

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "channel.created",
            targetType: "channel",
            targetId: channelId,
            reason: body.reason,
            metadata: {
              channelId,
              slug,
              paid: body.paid,
              adultOnly: body.adultOnly,
              contentRating: body.contentRating,
              currency,
              ratePerMinuteMinor,
              ratePerMinuteByCurrency,
            },
          });

          return Response.json(
            {
              channelId,
              slug,
              channelNumber: channelId,
              status: "DRAFT",
              published: false,
              paid: body.paid,
              currency,
              adultOnly: body.adultOnly,
              contentRating: body.contentRating,
            },
            { status: 201 },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
