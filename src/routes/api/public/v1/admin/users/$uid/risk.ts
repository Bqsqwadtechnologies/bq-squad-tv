import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { RISK_SIGNAL_TYPES, scoreRiskSignals, type RiskSignalType } from "@/lib/server/risk-engine";

export const Route = createFileRoute("/api/public/v1/admin/users/$uid/risk")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      try {
        const actor = await requireUser(request);
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(params.uid)) {
          throw new ApiError(400, "USER_ID_INVALID", "The account reference is invalid.");
        }
        const fs = await Firestore.create();
        await requireAdminModule(fs, actor, "security");
        const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
        const rows = await fs.query("riskCounters", {
          filters: [{ field: "uid", op: "EQUAL", value: params.uid }],
          limit: 1600,
        });
        const counts: Partial<Record<RiskSignalType, number>> = {};
        for (const type of RISK_SIGNAL_TYPES) counts[type] = 0;
        for (const row of rows) {
          if (typeof row["windowStart"] !== "string" || row["windowStart"] <= since) continue;
          const values = row["counts"] && typeof row["counts"] === "object"
            ? row["counts"] as Record<string, unknown> : {};
          for (const type of RISK_SIGNAL_TYPES) {
            const value = values[type];
            if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
              counts[type] = (counts[type] ?? 0) + value;
            }
          }
        }
        return Response.json({
          uid: params.uid,
          windowHours: 24,
          ...scoreRiskSignals(counts),
          counts,
        }, { headers: { "cache-control": "private, no-store" } });
      } catch (error) { return errorBody(error); }
    },
  } },
});
