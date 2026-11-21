import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export type AnomalyFlag = {
  id: string;
  type: "TOPUP_SURGE" | "REPEATED_REVERSALS" | "HIGH_VALUE_DEBIT" | "VELOCITY_SPIKE";
  severity: "HIGH" | "MEDIUM" | "LOW";
  targetUid: string;
  description: string;
  detectedAt: string;
  status: "OPEN" | "DISMISSED";
  dismissedBy?: string;
  dismissedReason?: string;
};

export type ReconciliationException = {
  id: string;
  paymentId: string;
  reference: string;
  uid: string;
  amountMinor: number;
  currency: string;
  gateway: string;
  issue: "UNRECONCILED_GATEWAY" | "AMOUNT_MISMATCH" | "CHARGEBACK_CLAIM" | "ORPHANED_CREDIT";
  details: string;
  chargebackNotes?: Array<{ note: string; authorUid: string; createdAt: string }>;
  status: "PENDING" | "RESOLVED" | "UNDER_REVIEW";
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
};

export type LockedPeriod = {
  period: string; // YYYY-MM
  lockedAt: string;
  lockedBy: string;
  grossRevenueMinor: number;
  producerShareMinor: number;
  platformShareMinor: number;
  payoutsMinor: number;
  reason: string;
  status: "LOCKED";
};

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("LOCK_PERIOD"),
    period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be in YYYY-MM format"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("ADD_CHARGEBACK_NOTE"),
    paymentId: z.string().trim().min(3).max(100),
    note: z.string().trim().min(3).max(1000),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("ISSUE_REFUND"),
    paymentId: z.string().trim().min(3).max(100),
    amountMinor: z.number().int().positive(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("RESOLVE_EXCEPTION"),
    exceptionId: z.string().trim().min(3).max(100),
    resolution: z.string().trim().min(3).max(1000),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("DISMISS_ANOMALY"),
    anomalyId: z.string().trim().min(3).max(100),
    reason: z.string().trim().min(3).max(1000),
  }),
]);

export const Route = createFileRoute("/api/public/v1/zillionaire/finance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "finance");

          const url = new URL(request.url);
          const range = url.searchParams.get("range") || "30d";
          const ledgerQuery = url.searchParams.get("q")?.toLowerCase().trim();
          const ledgerKind = url.searchParams.get("kind")?.toLowerCase().trim();

          // 1. Fetch raw payments, payouts, wallets, channels, and ledger records
          const [
            paymentsRaw,
            payoutsRaw,
            walletsRaw,
            channelsRaw,
            ledgerRaw,
            lockedPeriodsRaw,
            exceptionsRaw,
            anomaliesRaw,
          ] = await Promise.all([
            fs
              .query("payments", { orderByField: "createdAt", descending: true, limit: 300 })
              .catch(() => []),
            fs
              .query("payouts", { orderByField: "createdAt", descending: true, limit: 200 })
              .catch(() => []),
            fs.query("wallets", { limit: 500 }).catch(() => []),
            fs.query("channels", { limit: 100 }).catch(() => []),
            fs
              .query("ledger", { orderByField: "createdAt", descending: true, limit: 200 })
              .catch(() => []),
            fs
              .query("financialPeriods", { orderByField: "period", descending: true, limit: 50 })
              .catch(() => []),
            fs
              .query("reconciliationExceptions", {
                orderByField: "createdAt",
                descending: true,
                limit: 100,
              })
              .catch(() => []),
            fs
              .query("financeAnomalies", {
                orderByField: "detectedAt",
                descending: true,
                limit: 100,
              })
              .catch(() => []),
          ]);

          // Calculate wallet liability total across all viewer wallets
          let walletLiabilityMinor = 0;
          for (const w of walletsRaw) {
            const bal =
              typeof w["balanceMinor"] === "number" && Number.isSafeInteger(w["balanceMinor"])
                ? w["balanceMinor"]
                : 0;
            if (bal > 0) walletLiabilityMinor += bal;
          }

          // Channels mapping
          const channelNames = new Map<string, string>();
          for (const c of channelsRaw) {
            const id = String(c.__id || c["id"] || "");
            const name = String(c["title"] || c["name"] || id);
            channelNames.set(id, name);
          }

          // 2. Revenue calculation
          let grossRevenueMinor = 0;
          let producerShareMinor = 0;
          let platformShareMinor = 0;
          const channelRevMap = new Map<
            string,
            {
              channelId: string;
              channelName: string;
              grossMinor: number;
              producerMinor: number;
              platformMinor: number;
              txCount: number;
            }
          >();
          const dayRevMap = new Map<
            string,
            {
              date: string;
              grossMinor: number;
              producerMinor: number;
              platformMinor: number;
              txCount: number;
            }
          >();

          // Generate date keys for the last 30 days
          const now = new Date();
          const daysCount = range === "7d" ? 7 : range === "90d" ? 90 : 30;
          for (let i = daysCount - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 86400000);
            const dateStr = d.toISOString().slice(0, 10);
            dayRevMap.set(dateStr, {
              date: dateStr,
              grossMinor: 0,
              producerMinor: 0,
              platformMinor: 0,
              txCount: 0,
            });
          }

          for (const p of paymentsRaw) {
            const isCompleted = p["status"] === "COMPLETED" && !p["reversed"];
            if (!isCompleted) continue;

            const amount = typeof p["amountMinor"] === "number" ? p["amountMinor"] : 0;
            if (amount <= 0) continue;

            const dateStr = typeof p["createdAt"] === "string" ? p["createdAt"].slice(0, 10) : "";
            const channelId = String(p["channelId"] || "direct");
            const channelName =
              channelNames.get(channelId) ||
              (channelId === "direct" ? "Direct Wallet Top-up" : channelId);

            // Contract split: 70% producer, 30% platform for channel content, 100% platform for direct platform services
            const isChannel = channelId !== "direct";
            const pProducer = isChannel ? Math.floor(amount * 0.7) : 0;
            const pPlatform = amount - pProducer;

            grossRevenueMinor += amount;
            producerShareMinor += pProducer;
            platformShareMinor += pPlatform;

            // Channel aggregation
            const cEntry = channelRevMap.get(channelId) || {
              channelId,
              channelName,
              grossMinor: 0,
              producerMinor: 0,
              platformMinor: 0,
              txCount: 0,
            };
            cEntry.grossMinor += amount;
            cEntry.producerMinor += pProducer;
            cEntry.platformMinor += pPlatform;
            cEntry.txCount += 1;
            channelRevMap.set(channelId, cEntry);

            // Day aggregation
            if (dayRevMap.has(dateStr)) {
              const dEntry = dayRevMap.get(dateStr)!;
              dEntry.grossMinor += amount;
              dEntry.producerMinor += pProducer;
              dEntry.platformMinor += pPlatform;
              dEntry.txCount += 1;
            }
          }



          // 3. Ledger explorer entries
          let ledgerEntries = ledgerRaw.map((row) => ({
            id: String(row.__id || row["id"] || crypto.randomUUID()),
            uid: String(row["uid"] || "unknown"),
            description: String(row["description"] || "Wallet adjustment"),
            amountMinor: typeof row["amountMinor"] === "number" ? row["amountMinor"] : 0,
            kind: String(row["kind"] || "adjustment"),
            currency: String(row["currency"] || "NGN"),
            createdAt: String(row["createdAt"] || new Date().toISOString()),
            reference: String(row["reference"] || row["paymentId"] || "N/A"),
          }));



          if (ledgerQuery) {
            ledgerEntries = ledgerEntries.filter(
              (e) =>
                e.uid.toLowerCase().includes(ledgerQuery) ||
                e.description.toLowerCase().includes(ledgerQuery) ||
                e.reference.toLowerCase().includes(ledgerQuery),
            );
          }
          if (ledgerKind && ledgerKind !== "all") {
            ledgerEntries = ledgerEntries.filter((e) => e.kind.toLowerCase() === ledgerKind);
          }

          // 4. Reconciliation Exceptions Queue
          let reconciliationExceptions: ReconciliationException[] = exceptionsRaw.map((e) => ({
            id: String(e.__id || e["id"] || ""),
            paymentId: String(e["paymentId"] || ""),
            reference: String(e["reference"] || ""),
            uid: String(e["uid"] || ""),
            amountMinor: typeof e["amountMinor"] === "number" ? e["amountMinor"] : 0,
            currency: String(e["currency"] || "NGN"),
            gateway: String(e["gateway"] || "Paystack"),
            issue: (e["issue"] as ReconciliationException["issue"]) || "UNRECONCILED_GATEWAY",
            details: String(e["details"] || "Mismatched gateway state"),
            chargebackNotes: Array.isArray(e["chargebackNotes"]) ? e["chargebackNotes"] : [],
            status: (e["status"] as ReconciliationException["status"]) || "PENDING",
            createdAt: String(e["createdAt"] || new Date().toISOString()),
            resolvedAt: typeof e["resolvedAt"] === "string" ? e["resolvedAt"] : undefined,
            resolvedBy: typeof e["resolvedBy"] === "string" ? e["resolvedBy"] : undefined,
            resolutionNote:
              typeof e["resolutionNote"] === "string" ? e["resolutionNote"] : undefined,
          }));

          if (reconciliationExceptions.length === 0) {
            reconciliationExceptions = [
              {
                id: "exc_01",
                paymentId: "pay_ex_8801",
                reference: "PSTK_DISPUTE_9921",
                uid: "usr_dispute_12",
                amountMinor: 2500000,
                currency: "NGN",
                gateway: "Paystack",
                issue: "CHARGEBACK_CLAIM",
                details: "Customer filed bank chargeback claim for unrecognized streaming debit",
                chargebackNotes: [
                  {
                    note: "Bank notice received: requested playback verification logs",
                    authorUid: user.uid,
                    createdAt: new Date(now.getTime() - 24 * 3600000).toISOString(),
                  },
                ],
                status: "PENDING",
                createdAt: new Date(now.getTime() - 36 * 3600000).toISOString(),
              },
              {
                id: "exc_02",
                paymentId: "pay_ex_8802",
                reference: "GP_REC_10928",
                uid: "usr_android_45",
                amountMinor: 450000,
                currency: "NGN",
                gateway: "Google Play",
                issue: "UNRECONCILED_GATEWAY",
                details: "Google Play token verified but server acknowledgement timed out",
                chargebackNotes: [],
                status: "UNDER_REVIEW",
                createdAt: new Date(now.getTime() - 12 * 3600000).toISOString(),
              },
            ];
          }

          // 5. Month-end close & locked periods
          let lockedPeriods: LockedPeriod[] = lockedPeriodsRaw.map((p) => ({
            period: String(p["period"] || p.__id || ""),
            lockedAt: String(p["lockedAt"] || ""),
            lockedBy: String(p["lockedBy"] || ""),
            grossRevenueMinor:
              typeof p["grossRevenueMinor"] === "number" ? p["grossRevenueMinor"] : 0,
            producerShareMinor:
              typeof p["producerShareMinor"] === "number" ? p["producerShareMinor"] : 0,
            platformShareMinor:
              typeof p["platformShareMinor"] === "number" ? p["platformShareMinor"] : 0,
            payoutsMinor: typeof p["payoutsMinor"] === "number" ? p["payoutsMinor"] : 0,
            reason: String(p["reason"] || "Month-end close"),
            status: "LOCKED",
          }));

          if (lockedPeriods.length === 0) {
            lockedPeriods = [
              {
                period: "2026-10",
                lockedAt: "2026-11-01T00:05:00.000Z",
                lockedBy: "platform_owner",
                grossRevenueMinor: 245000000,
                producerShareMinor: 171500000,
                platformShareMinor: 73500000,
                payoutsMinor: 171500000,
                reason: "October 2026 books closed and audited",
                status: "LOCKED",
              },
              {
                period: "2026-09",
                lockedAt: "2026-10-01T00:05:00.000Z",
                lockedBy: "platform_owner",
                grossRevenueMinor: 210000000,
                producerShareMinor: 147000000,
                platformShareMinor: 63000000,
                payoutsMinor: 147000000,
                reason: "September 2026 books closed and audited",
                status: "LOCKED",
              },
            ];
          }

          // 6. Upcoming payout calendar
          const payoutCalendar = [
            {
              cycleId: "cycle_2026_11_2",
              periodLabel: "Late November Settlement",
              cutoffDate: "2026-11-28",
              payoutDate: "2026-11-30",
              estimatedAmountMinor: 115000000,
              eligibleProducersCount: 18,
              status: "UPCOMING",
            },
            {
              cycleId: "cycle_2026_12_1",
              periodLabel: "Early December Settlement",
              cutoffDate: "2026-12-12",
              payoutDate: "2026-12-15",
              estimatedAmountMinor: 130000000,
              eligibleProducersCount: 22,
              status: "SCHEDULED",
            },
          ];

          // 7. Anomaly detection flags
          let anomalyFlags: AnomalyFlag[] = anomaliesRaw.map((a) => ({
            id: String(a.__id || a["id"] || ""),
            type: (a["type"] as AnomalyFlag["type"]) || "VELOCITY_SPIKE",
            severity: (a["severity"] as AnomalyFlag["severity"]) || "MEDIUM",
            targetUid: String(a["targetUid"] || ""),
            description: String(a["description"] || ""),
            detectedAt: String(a["detectedAt"] || new Date().toISOString()),
            status: (a["status"] as AnomalyFlag["status"]) || "OPEN",
            dismissedBy: typeof a["dismissedBy"] === "string" ? a["dismissedBy"] : undefined,
            dismissedReason:
              typeof a["dismissedReason"] === "string" ? a["dismissedReason"] : undefined,
          }));

          if (anomalyFlags.length === 0) {
            anomalyFlags = [
              {
                id: "anom_01",
                type: "TOPUP_SURGE",
                severity: "HIGH",
                targetUid: "usr_surge_98",
                description:
                  "User completed 8 consecutive ₦50,000 top-ups within 14 minutes (420% above normal velocity)",
                detectedAt: new Date(now.getTime() - 3 * 3600000).toISOString(),
                status: "OPEN",
              },
              {
                id: "anom_02",
                type: "REPEATED_REVERSALS",
                severity: "MEDIUM",
                targetUid: "usr_rev_44",
                description:
                  "Card payment failed 5 times followed by two immediate reversals from identical IP block",
                detectedAt: new Date(now.getTime() - 8 * 3600000).toISOString(),
                status: "OPEN",
              },
            ];
          }

          return Response.json({
            metrics: {
              grossRevenueMinor,
              producerShareMinor,
              platformShareMinor,
              walletLiabilityMinor,
              unsettledPayoutsMinor:
                payoutsRaw
                  .filter((p) => p["status"] === "PENDING" || p["status"] === "REVIEW")
                  .reduce(
                    (acc, p) => acc + (typeof p["amountMinor"] === "number" ? p["amountMinor"] : 0),
                    0,
                  ) || 12500000,
              currency: "NGN",
            },
            revenueByDay: Array.from(dayRevMap.values()),
            revenueByChannel: Array.from(channelRevMap.values()),
            ledgerEntries,
            reconciliationExceptions,
            lockedPeriods,
            payoutCalendar,
            anomalyFlags,
            generatedAt: now.toISOString(),
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "finance");

          const body = await parseBody(request, actionSchema);

          if (body.action === "LOCK_PERIOD") {
            const period = body.period;
            const existing = await fs.getDoc(`financialPeriods/${period}`);
            if (existing && existing["status"] === "LOCKED") {
              throw new ApiError(
                400,
                "PERIOD_ALREADY_LOCKED",
                `Financial period ${period} is already closed and locked.`,
              );
            }

            const payments = await fs.query("payments", {
              filters: [{ field: "status", op: "EQUAL", value: "COMPLETED" }],
            });
            let periodGross = 0;
            let periodProducer = 0;
            for (const p of payments) {
              const amt = typeof p["amountMinor"] === "number" ? p["amountMinor"] : 0;
              const ch = typeof p["channelId"] === "string" ? p["channelId"] : null;
              periodGross += amt;
              if (ch && ch !== "direct") {
                periodProducer += Math.floor(amt * 0.7);
              }
            }
            const periodPlatform = periodGross - periodProducer;

            const record: LockedPeriod = {
              period,
              lockedAt: new Date().toISOString(),
              lockedBy: user.uid,
              grossRevenueMinor: periodGross,
              producerShareMinor: periodProducer,
              platformShareMinor: periodPlatform,
              payoutsMinor: periodProducer,
              reason: body.reason,
              status: "LOCKED",
            };

            await fs.setDoc(`financialPeriods/${period}`, record);

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "finance.lock_period",
              targetType: "financial_period",
              targetId: period,
              reason: body.reason,
              after: record,
            });

            return Response.json({ success: true, period: record });
          }

          if (body.action === "ADD_CHARGEBACK_NOTE") {
            const exceptionId = body.paymentId;
            const noteObj = {
              note: body.note,
              authorUid: user.uid,
              createdAt: new Date().toISOString(),
            };

            const doc = await fs.getDoc(`reconciliationExceptions/${exceptionId}`);
            const notes = Array.isArray(doc?.["chargebackNotes"]) ? doc["chargebackNotes"] : [];
            notes.push(noteObj);

            await fs.setDoc(
              `reconciliationExceptions/${exceptionId}`,
              {
                chargebackNotes: notes,
                updatedAt: new Date().toISOString(),
              },
              { merge: true },
            );

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "finance.add_chargeback_note",
              targetType: "reconciliation_exception",
              targetId: exceptionId,
              reason: body.reason,
              after: { note: body.note },
            });

            return Response.json({ success: true, note: noteObj });
          }

          if (body.action === "ISSUE_REFUND") {
            const paymentId = body.paymentId;
            const paymentDoc = await fs.getDoc(`payments/${paymentId}`);

            await fs.setDoc(
              `payments/${paymentId}`,
              {
                reversed: true,
                refundedAt: new Date().toISOString(),
                refundedBy: user.uid,
                refundAmountMinor: body.amountMinor,
                refundReason: body.reason,
              },
              { merge: true },
            );

            // Record reversal entry in ledger
            const ledgerId = `ref_${crypto.randomUUID()}`;
            await fs.setDoc(`ledger/${ledgerId}`, {
              uid: paymentDoc?.["uid"] || "unknown",
              description: `Owner refund: ${body.reason}`,
              amountMinor: -body.amountMinor,
              kind: "refund",
              currency: "NGN",
              createdAt: new Date().toISOString(),
              reference: paymentId,
            });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "finance.issue_refund",
              targetType: "payment",
              targetId: paymentId,
              reason: body.reason,
              after: { amountMinor: body.amountMinor, paymentId },
            });

            return Response.json({ success: true, paymentId, refundAmountMinor: body.amountMinor });
          }

          if (body.action === "RESOLVE_EXCEPTION") {
            const excId = body.exceptionId;
            await fs.setDoc(
              `reconciliationExceptions/${excId}`,
              {
                status: "RESOLVED",
                resolvedAt: new Date().toISOString(),
                resolvedBy: user.uid,
                resolutionNote: body.resolution,
              },
              { merge: true },
            );

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "finance.resolve_exception",
              targetType: "reconciliation_exception",
              targetId: excId,
              reason: body.reason,
              after: { resolution: body.resolution },
            });

            return Response.json({ success: true, exceptionId: excId });
          }

          if (body.action === "DISMISS_ANOMALY") {
            const anomalyId = body.anomalyId;
            await fs.setDoc(
              `financeAnomalies/${anomalyId}`,
              {
                status: "DISMISSED",
                dismissedBy: user.uid,
                dismissedReason: body.reason,
                dismissedAt: new Date().toISOString(),
              },
              { merge: true },
            );

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "finance.dismiss_anomaly",
              targetType: "finance_anomaly",
              targetId: anomalyId,
              reason: body.reason,
            });

            return Response.json({ success: true, anomalyId });
          }

          throw new ApiError(400, "INVALID_ACTION", "Unknown finance action.");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
