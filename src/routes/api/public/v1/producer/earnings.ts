import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";

function minor(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export const Route = createFileRoute("/api/public/v1/producer/earnings")({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const fs = await Firestore.create();
      await requirePlatformRole(fs, user, "producer");
      const [producer, ledger, payouts] = await Promise.all([
        fs.getDoc("producers/" + user.uid),
        fs.query("ledger", {
          filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
          orderByField: "createdAt",
          descending: true,
          limit: 100,
        }),
        fs.query("payouts", {
          filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
          orderByField: "createdAt",
          descending: true,
          limit: 50,
        }),
      ]);
      if (!producer) return Response.json({ error: "Producer account not found." }, { status: 404 });
      const balances = producer["earningsBalanceByCurrency"] && typeof producer["earningsBalanceByCurrency"] === "object"
        ? producer["earningsBalanceByCurrency"] as Record<string, unknown> : {};
      const lifetime = producer["earningsLifetimeByCurrency"] && typeof producer["earningsLifetimeByCurrency"] === "object"
        ? producer["earningsLifetimeByCurrency"] as Record<string, unknown> : {};
      const reserved = producer["payoutReservedByCurrency"] && typeof producer["payoutReservedByCurrency"] === "object"
        ? producer["payoutReservedByCurrency"] as Record<string, unknown> : {};
      const earningRows = ledger.filter(row =>
        row["kind"] === "producer_earning" || row["kind"] === "producer_adjustment" || row["kind"] === "producer_reversal"
      );
      const sessionIds = [...new Set(earningRows
        .map(row => row["sessionId"])
        .filter((value): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value))
      )].slice(0, 50);
      const sessions = await Promise.all(sessionIds.map(id => fs.getDoc("sessions/" + id)));
      const sessionById = new Map(sessionIds.map((id, index) => [id, sessions[index]]));
      const perChannel: Record<string, { channelId: string; earningsByCurrency: Record<string, number>; earningCount: number }> = {};
      for (const row of earningRows) {
        const sessionId = typeof row["sessionId"] === "string" ? row["sessionId"] as string : "";
        const session = sessionId ? sessionById.get(sessionId) : null;
        const channelId = typeof session?.["channelId"] === "string" ? session["channelId"] as string : "unassigned";
        const currency = typeof row["currency"] === "string" ? row["currency"] as string : "USD";
        const amount = minor(row["amountMinor"]);
        const group = perChannel[channelId] ?? { channelId, earningsByCurrency: {}, earningCount: 0 };
        group.earningsByCurrency[currency] = (group.earningsByCurrency[currency] ?? 0) + amount;
        group.earningCount += 1;
        perChannel[channelId] = group;
      }
      return Response.json({
        currencyBalances: Object.fromEntries(Object.entries(balances).map(([currency, value]) => [currency, minor(value)])),
        lifetimeEarningsByCurrency: Object.fromEntries(Object.entries(lifetime).map(([currency, value]) => [currency, minor(value)])),
        reservedPayoutsByCurrency: Object.fromEntries(Object.entries(reserved).map(([currency, value]) => [currency, minor(value)])),
        // Legacy NGN fields remain readable for existing producer clients.
        earningsBalanceMinor: minor(producer["earningsBalanceMinor"]),
        earningsLifetimeMinor: minor(producer["earningsLifetimeMinor"]),
        perChannel: Object.values(perChannel),
        statement: earningRows.slice(0, 50).map(row => ({
          id: row.__id,
          kind: row["kind"] ?? "producer_earning",
          sessionId: row["sessionId"] ?? null,
          amountMinor: typeof row["amountMinor"] === "number" && Number.isSafeInteger(row["amountMinor"]) ? row["amountMinor"] : 0,
          currency: typeof row["currency"] === "string" ? row["currency"] : "USD",
          createdAt: typeof row["createdAt"] === "string" ? row["createdAt"] : null,
        })),
        payouts: payouts.map(row => ({
          id: row.__id,
          amountMinor: minor(row["amountMinor"]),
          currency: typeof row["currency"] === "string" ? row["currency"] : "USD",
          status: typeof row["status"] === "string" ? row["status"] : "UNKNOWN",
          createdAt: typeof row["createdAt"] === "string" ? row["createdAt"] : null,
          settledAt: typeof row["settledAt"] === "string" ? row["settledAt"] : null,
          settlementReference: typeof row["settlementReference"] === "string" ? row["settlementReference"] : null,
        })),
        statementWindow: "latest 100 ledger rows; latest 50 earnings entries shown",
      }, { headers: { "cache-control": "no-store" } });
    } catch (error) { return errorBody(error); }
  } } },
});
