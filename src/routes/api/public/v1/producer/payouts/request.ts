import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { requireCurrency } from "@/lib/server/currency";

const schema = z.object({
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/),
  idempotencyKey: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/v1/producer/payouts/request")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      const currency = requireCurrency(body.currency);
      const fs = await Firestore.create();
      await requirePlatformRole(fs, user, "producer");
      await enforceRateLimit(fs, "producer-payout-request:" + user.uid, { limit: 3, windowMs: 60 * 60_000 });

      const idDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(user.uid + ":" + body.idempotencyKey));
      const id = Array.from(new Uint8Array(idDigest), byte => byte.toString(16).padStart(2, "0")).join("");
      const payoutId = "po_" + id;
      const payoutPath = "payouts/" + payoutId;
      const producerPath = "producers/" + user.uid;
      const ledgerPath = "ledger/" + payoutId;
      const now = new Date().toISOString();
      const result = await fs.transact([producerPath, payoutPath, ledgerPath], ([producer, existingPayout, existingLedger]) => {
        if (!producer) throw new ApiError(403, "PRODUCER_ACCOUNT_REQUIRED", "A verified producer account is required.");
        if (existingPayout) {
          if (existingPayout["uid"] !== user.uid || existingPayout["idempotencyKey"] !== body.idempotencyKey) {
            throw new ApiError(409, "PAYOUT_IDEMPOTENCY_CONFLICT", "This payout request key has already been used.");
          }
          return { result: { payoutId, status: existingPayout["status"], amountMinor: existingPayout["amountMinor"], currency: existingPayout["currency"], duplicate: true }, writes: [] };
        }
        if (existingLedger) throw new ApiError(409, "PAYOUT_LEDGER_CONFLICT", "A payout ledger record already exists.");
        const balances = producer["earningsBalanceByCurrency"] && typeof producer["earningsBalanceByCurrency"] === "object"
          ? producer["earningsBalanceByCurrency"] as Record<string, unknown> : {};
        const currentBalance = typeof balances[currency] === "number"
          ? balances[currency] as number
          : currency === "NGN" && typeof producer["earningsBalanceMinor"] === "number"
            ? producer["earningsBalanceMinor"] as number : 0;
        if (!Number.isSafeInteger(currentBalance) || currentBalance < body.amountMinor) {
          throw new ApiError(409, "PAYOUT_BALANCE_INSUFFICIENT", "Your available producer earnings are not sufficient for this payout.");
        }
        const nextBalances = { ...balances, [currency]: currentBalance - body.amountMinor };
        const reserved = producer["payoutReservedByCurrency"] && typeof producer["payoutReservedByCurrency"] === "object"
          ? producer["payoutReservedByCurrency"] as Record<string, unknown> : {};
        const nextReserved = { ...reserved, [currency]: (typeof reserved[currency] === "number" ? reserved[currency] as number : 0) + body.amountMinor };
        const producerFields: Record<string, unknown> = {
          earningsBalanceByCurrency: nextBalances,
          payoutReservedByCurrency: nextReserved,
          updatedAt: now,
          ...(currency === "NGN" ? { earningsBalanceMinor: nextBalances["NGN"] } : {}),
        };
        return {
          result: { payoutId, status: "REQUESTED", amountMinor: body.amountMinor, currency, duplicate: false },
          writes: [
            { update: { name: fs.docName(producerPath), fields: encodeFields(producerFields) }, updateMask: { fieldPaths: Object.keys(producerFields) } },
            { update: { name: fs.docName(payoutPath), fields: encodeFields({
              uid: user.uid, amountMinor: body.amountMinor, currency, status: "REQUESTED",
              idempotencyKey: body.idempotencyKey, createdAt: now, updatedAt: now,
            }) }, currentDocument: { exists: false } },
            { update: { name: fs.docName(ledgerPath), fields: encodeFields({
              uid: user.uid, kind: "payout_requested", description: "Producer payout requested",
              amountMinor: -body.amountMinor, currency, payoutId, createdAt: now,
            }) }, currentDocument: { exists: false } },
          ],
        };
      });
      return Response.json(result, { status: result.duplicate ? 200 : 201, headers: { "cache-control": "no-store" } });
    } catch (error) { return errorBody(error); }
  } } },
});
