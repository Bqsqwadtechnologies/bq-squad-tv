import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule, resolvePlatformAccess } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { listSecurityHolds, resolveSecurityHold } from "@/lib/server/abuse-protection";

const resolveSchema = z
  .object({
    holdId: z.string().trim().min(1).max(80),
    action: z.enum(["RELEASE", "CONFIRM_BAN"]),
    reason: z.string().trim().min(3).max(1000),
    stepUpConfirmed: z.boolean().optional(),
  })
  .strict();

// createFileRoute("/api/public/v1/zillionaire/security/holds")
export const Route = createFileRoute("/api/public/v1/zillionaire/security/holds")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");
          await enforceRateLimit(fs, "zillionaire-holds:" + user.uid, {
            limit: 60,
            windowMs: 60_000,
          });

          const url = new URL(request.url);
          const status = url.searchParams.get("status") || undefined;
          const targetType = url.searchParams.get("targetType") || undefined;
          const rawLimit = Number.parseInt(url.searchParams.get("limit") || "100", 10);
          const limit = Number.isSafeInteger(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 100;

          const result = await listSecurityHolds(fs, {
            ...(status ? { status } : {}),
            ...(targetType ? { targetType } : {}),
            limit,
          });

          return Response.json(result, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }: { request: Request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, resolveSchema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");
          await enforceRateLimit(fs, "zillionaire-holds-resolve:" + user.uid, {
            limit: 30,
            windowMs: 60_000,
          });

          if (body.action === "CONFIRM_BAN") {
            const access = await resolvePlatformAccess(
              fs,
              user.uid,
              user.email,
              user.customClaims,
              user.emailVerified === true,
            );
            if (!access.isZillionaireOwner) {
              throw new ApiError(
                403,
                "OWNER_ONLY",
                "Only the verified platform owner can confirm permanent account suspensions.",
              );
            }
          }

          const updated = await resolveSecurityHold(fs, {
            holdId: body.holdId,
            action: body.action,
            reason: body.reason,
            actorUid: user.uid,
          });

          return Response.json({ hold: updated }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
