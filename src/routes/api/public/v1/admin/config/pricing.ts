import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const topupSchema = z.object({
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  creditMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
});
const playProductSchema = z.object({
  productId: z.string().regex(/^[A-Za-z0-9._-]{1,150}$/),
  title: z.string().min(1).max(100),
  description: z.string().max(300).default(""),
  credits: z.number().int().positive().max(1_000_000),
  creditMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  active: z.boolean().default(true),
});
const schema = z.object({
  defaultRatePerMinuteMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  minimumSessionBalanceMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  defaultProducerShareBps: z.number().int().min(0).max(10_000),
  maxConcurrentSessions: z.number().int().min(1).max(5).default(2),
  walletTopups: z.record(z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), topupSchema),
  googlePlayProducts: z.array(playProductSchema).max(100),
});

export const Route = createFileRoute("/api/public/v1/admin/config/pricing")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        await requireAdminModule(fs, user, "pricing");
        const config = await fs.getDoc("config/pricing");
        if (!config) throw new ApiError(404, "PRICING_NOT_CONFIGURED", "Pricing has not been configured.");
        return Response.json(config);
      } catch (error) { return errorBody(error); }
    },
    PUT: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const body = await parseBody(request, schema);
        const fs = await Firestore.create();
        await requireAdminModule(fs, user, "pricing");
        const now = new Date().toISOString();
        const version = await fs.transact(["config/pricing"], docs => {
          const current = docs[0];
          const currentVersion = current?.["version"] === undefined ? 0 : current["version"];
          if (typeof currentVersion !== "number" || !Number.isSafeInteger(currentVersion) || currentVersion < 0) {
            throw new ApiError(409, "PRICING_VERSION_INVALID", "The existing pricing version is invalid.");
          }
          const nextVersion = currentVersion + 1;
          return {
            result: nextVersion,
            writes: [{
              update: { name: fs.docName("config/pricing"), fields: encodeFields({
                ...body, version: nextVersion, updatedAt: now, updatedBy: user.uid,
              }) },
            }],
          };
        });
        await writeAuditLog(fs, {
          actorUid: user.uid, action: "pricing.updated", targetType: "pricing", targetId: "config/pricing",
          reason: "Administrator updated versioned platform pricing",
          metadata: { version, walletTopupCount: Object.keys(body.walletTopups).length, googlePlayProductCount: body.googlePlayProducts.length },
        });
        return Response.json({ saved: true, version });
      } catch (error) { return errorBody(error); }
    },
  } },
});
