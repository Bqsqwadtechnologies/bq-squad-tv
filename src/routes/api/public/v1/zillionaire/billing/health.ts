import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/billing/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "payments");

          // Query active sessions and wallet holds
          const activeSessions = await fs.query("sessions");
          const active = activeSessions.filter(
            (s: Record<string, unknown>) => s["active"] === true,
          );
          const recovered = activeSessions.filter(
            (s: Record<string, unknown>) => s["state"] === "recovered",
          );

          let totalUnsettledSeconds = 0;
          for (const s of active) {
            const accepted = typeof s["acceptedSeconds"] === "number" ? s["acceptedSeconds"] : 0;
            const billed = typeof s["billedSeconds"] === "number" ? s["billedSeconds"] : 0;
            totalUnsettledSeconds += Math.max(0, accepted - billed);
          }

          const holds = await fs.query("walletHolds");
          let totalHoldMinor = 0;
          for (const h of holds) {
            totalHoldMinor += typeof h["amountMinor"] === "number" ? h["amountMinor"] : 0;
          }

          return Response.json({
            activeSessionsCount: active.length,
            totalUnsettledSeconds,
            recoveredSessionsCount: recovered.length,
            settlementErrorsCount: 0,
            totalActiveHoldsMinor: totalHoldMinor,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
