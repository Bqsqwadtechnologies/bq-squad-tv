import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getWallet, parseBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { requestDailyLimitChange } from "@/lib/server/wallet-limits";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  monthlyBudgetMinor: z.number().int().nonnegative().safe().nullable().optional(),
  lowBalanceAlertMinor: z.number().int().nonnegative().safe().nullable().optional(),
  dailySpendLimitMinor: z.number().int().nonnegative().safe().optional(),
}).strict();

export const Route = createFileRoute("/api/public/v1/wallet/preferences")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        const wallet = await getWallet(fs, user.uid);
        return Response.json({
          currencyCode: wallet.currency,
          monthlyBudgetMinor: typeof wallet.monthlyBudgetMinor === "number" ? wallet.monthlyBudgetMinor : null,
          lowBalanceAlertMinor: typeof wallet.lowBalanceAlertMinor === "number" ? wallet.lowBalanceAlertMinor : null,
          dailySpendLimitMinor: wallet.dailySpendLimitMinor,
          pendingDailySpendLimitMinor: typeof wallet.pendingDailySpendLimitMinor === "number" ? wallet.pendingDailySpendLimitMinor : null,
          pendingDailySpendLimitEffectiveAt: typeof wallet.pendingDailySpendLimitEffectiveAt === "string" ? wallet.pendingDailySpendLimitEffectiveAt : null,
        }, { headers: { "cache-control": "private, no-store" } });
      } catch (error) { return errorBody(error); }
    },
    PATCH: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const body = await parseBody(request, schema);
        const fs = await Firestore.create();
        await enforceRateLimit(fs, "wallet-preferences:" + user.uid, { limit: 8, windowMs: 60_000 });
        const wallet = await getWallet(fs, user.uid);
        const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
        if (body.monthlyBudgetMinor !== undefined) patch["monthlyBudgetMinor"] = body.monthlyBudgetMinor;
        if (body.lowBalanceAlertMinor !== undefined) patch["lowBalanceAlertMinor"] = body.lowBalanceAlertMinor;
        if (body.dailySpendLimitMinor !== undefined) {
          const change = requestDailyLimitChange({
            currentLimitMinor: wallet.dailySpendLimitMinor,
            requestedLimitMinor: body.dailySpendLimitMinor,
          });
          patch["dailySpendLimitMinor"] = change.dailyLimitMinor;
          patch["pendingDailySpendLimitMinor"] = change.pendingDailyLimitMinor;
          patch["pendingDailySpendLimitEffectiveAt"] = change.pendingEffectiveAt;
        }
        await fs.patchDoc("wallets/" + user.uid, patch);
        await writeAuditLog(fs, {
          actorUid: user.uid, action: "wallet.preferences.updated",
          targetType: "wallet", targetId: user.uid,
          reason: "Viewer updated personal spending controls",
          metadata: {
            monthlyBudgetChanged: body.monthlyBudgetMinor !== undefined,
            lowBalanceAlertChanged: body.lowBalanceAlertMinor !== undefined,
            dailyLimitChanged: body.dailySpendLimitMinor !== undefined,
          },
        });
        return Response.json({ updated: true, currencyCode: wallet.currency }, { headers: { "cache-control": "no-store" } });
      } catch (error) { return errorBody(error); }
    },
  } },
});
