import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";

function currencyTotals(rows: Array<Record<string, unknown> & { __id: string }>) {
  const totals: Record<string, { amountMinor: number; entries: number }> = {};
  for (const row of rows) {
    const currency = typeof row["currency"] === "string" ? row["currency"] : "USD";
    const amount = typeof row["amountMinor"] === "number" && Number.isSafeInteger(row["amountMinor"])
      ? row["amountMinor"] : 0;
    const current = totals[currency] ?? { amountMinor: 0, entries: 0 };
    current.amountMinor += amount;
    current.entries += 1;
    totals[currency] = current;
  }
  return totals;
}

export const Route = createFileRoute("/api/public/v1/admin/reports/monthly")({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const fs = await Firestore.create();
      await requireAdminModule(fs, user, "overview");
      await enforceRateLimit(fs, "admin-monthly-report:" + user.uid, { limit: 10, windowMs: 60_000 });
      const url = new URL(request.url);
      const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        throw new ApiError(400, "REPORT_MONTH_INVALID", "Month must use YYYY-MM format.");
      }
      const start = new Date(month + "-01T00:00:00.000Z");
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      const startIso = start.toISOString();
      const endIso = end.toISOString();
      const [ledger, payouts, adEvents, reviews] = await Promise.all([
        fs.query("ledger", { filters: [{ field: "createdAt", op: "GREATER_THAN", value: startIso }], limit: 1000 }),
        fs.query("payouts", { filters: [{ field: "createdAt", op: "GREATER_THAN", value: startIso }], limit: 500 }),
        fs.query("adEvents", { filters: [{ field: "createdAt", op: "GREATER_THAN", value: startIso }], limit: 1000 }),
        fs.query("producerVerificationReviews", { filters: [{ field: "createdAt", op: "GREATER_THAN", value: startIso }], limit: 500 }),
      ]);
      const inMonth = (row: Record<string, unknown>) => typeof row["createdAt"] === "string" &&
        row["createdAt"] >= startIso && row["createdAt"] < endIso;
      const monthLedger = ledger.filter(inMonth);
      const monthPayouts = payouts.filter(inMonth);
      const monthAds = adEvents.filter(inMonth);
      const monthReviews = reviews.filter(inMonth);
      const ledgerByKind: Record<string, { entries: number; amountByCurrency: Record<string, number> }> = {};
      for (const row of monthLedger) {
        const kind = typeof row["kind"] === "string" ? row["kind"] : "unknown";
        const currency = typeof row["currency"] === "string" ? row["currency"] : "USD";
        const amount = typeof row["amountMinor"] === "number" && Number.isSafeInteger(row["amountMinor"])
          ? row["amountMinor"] : 0;
        const group = ledgerByKind[kind] ?? { entries: 0, amountByCurrency: {} };
        group.entries += 1;
        group.amountByCurrency[currency] = (group.amountByCurrency[currency] ?? 0) + amount;
        ledgerByKind[kind] = group;
      }
      const payoutByStatus: Record<string, number> = {};
      for (const row of monthPayouts) {
        const status = typeof row["status"] === "string" ? row["status"] : "UNKNOWN";
        payoutByStatus[status] = (payoutByStatus[status] ?? 0) + 1;
      }
      const adEventsByType: Record<string, number> = {};
      for (const row of monthAds) {
        const event = typeof row["event"] === "string" ? row["event"] : "unknown";
        adEventsByType[event] = (adEventsByType[event] ?? 0) + 1;
      }
      return Response.json({
        month,
        range: { start: startIso, endExclusive: endIso },
        ledger: { entries: monthLedger.length, totalsByCurrency: currencyTotals(monthLedger), byKind: ledgerByKind },
        payouts: { requests: monthPayouts.length, byStatus: payoutByStatus, totalsByCurrency: currencyTotals(monthPayouts) },
        advertising: { events: monthAds.length, byEvent: adEventsByType },
        producerReviews: { decisions: monthReviews.length },
        truncated: {
          ledger: ledger.length === 1000,
          payouts: payouts.length === 500,
          advertising: adEvents.length === 1000,
          producerReviews: reviews.length === 500,
        },
        note: "Amounts are ledger/payout records in integer minor currency units. This is an operational summary, not a bank reconciliation or audited financial statement.",
      }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      return errorBody(error);
    }
  } } },
});
