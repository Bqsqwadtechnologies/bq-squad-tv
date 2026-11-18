import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/admin/billing/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const access = await requireAdminModule(fs, user, "payments");
          if (!access.isZillionaireOwner && !access.hasModule) {
            throw new ApiError(403, "FORBIDDEN", "You do not have permission to view billing health.");
          }

          // Query active sessions and wallet holds
          const activeSessions = await fs.listDocs("sessions");
          const active = activeSessions.filter((s) => s["active"] === true);
          const recovered = activeSessions.filter((s) => s["state"] === "recovered");

          let totalUnsettledSeconds = 0;
          for (const s of active) {
            const accepted = typeof s["acceptedSeconds"] === "number" ? s["acceptedSeconds"] : 0;
            const billed = typeof s["billedSeconds"] === "number" ? s["billedSeconds"] : 0;
            totalUnsettledSeconds += Math.max(0, accepted - billed);
          }

          const holds = await fs.listDocs("walletHolds");
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
