import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getPricingConfig, requireMinorUnitAmount } from "@/lib/server/pricing";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  title: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().max(3000).default(""),
  language: z.string().trim().min(2).max(20).default("en"),
  contentRating: z.enum(["G", "PG", "13+", "16+", "18+"]).default("G"),
  adultOnly: z.boolean().default(false),
  paid: z.boolean().default(false),
  ratePerMinuteMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  minimumBalanceMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  reason: z.string().trim().min(3).max(1000),
}).superRefine((value, context) => {
  if (value.adultOnly && value.contentRating !== "18+") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["contentRating"], message: "Adult-only channels must use the 18+ rating." });
  }
  if (!value.adultOnly && value.contentRating === "18+") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["adultOnly"], message: "An 18+ channel must be explicitly marked adult-only." });
  }
  if (value.paid && (!Number.isSafeInteger(value.ratePerMinuteMinor) || (value.ratePerMinuteMinor ?? 0) < 1)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ratePerMinuteMinor"], message: "Paid channels require a positive per-minute price in minor currency units." });
  }
  if (!value.paid && value.ratePerMinuteMinor !== undefined && value.ratePerMinuteMinor !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ratePerMinuteMinor"], message: "Free channels must have a zero price." });
  }
});

function numericChannelId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let result = String((bytes[0]! % 9) + 1);
  for (let index = 1; index < bytes.length; index += 1) result += String(bytes[index]! % 10);
  return result;
}

export const Route = createFileRoute("/api/public/v1/admin/channels")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          await requireAdminModule(fs, user, "channels");
          await enforceRateLimit(fs, "platform-channel-create:" + user.uid, { limit: 30, windowMs: 60 * 60_000 });
          const pricing = await getPricingConfig(fs);
          const ratePerMinuteMinor = body.paid
            ? requireMinorUnitAmount(body.ratePerMinuteMinor, "ratePerMinuteMinor")
            : 0;
          const minimumBalanceMinor = body.minimumBalanceMinor ??
            (body.paid ? requireMinorUnitAmount(pricing["minimumSessionBalanceMinor"] ?? 0, "minimumSessionBalanceMinor") : 0);

          let channelId = "";
          let created = false;
          for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
            channelId = numericChannelId();
            const now = new Date().toISOString();
            const fields = {
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
              ratePerMinuteMinor,
              minimumBalanceMinor,
              producerShareBps: 0,
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
            const result = await fs.transact(["channels/" + channelId], docs => {
              if (docs[0]) return { result: false, writes: [] };
              return {
                result: true,
                writes: [{
                  update: { name: fs.docName("channels/" + channelId), fields: encodeFields(fields) },
                  currentDocument: { exists: false },
                }],
              };
            });
            created = result;
          }
          if (!created) throw new ApiError(503, "CHANNEL_ID_GENERATION_FAILED", "A unique numeric channel number could not be allocated. Please retry.");

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "channel.created",
            targetType: "channel",
            targetId: channelId,
            reason: body.reason,
            metadata: {
              channelNumber: channelId,
              paid: body.paid,
              adultOnly: body.adultOnly,
              contentRating: body.contentRating,
              ratePerMinuteMinor,
            },
          });
          return Response.json({
            channelId,
            channelNumber: channelId,
            status: "DRAFT",
            published: false,
            paid: body.paid,
            adultOnly: body.adultOnly,
            contentRating: body.contentRating,
          }, { status: 201 });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
