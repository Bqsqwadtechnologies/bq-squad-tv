import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/producer/analytics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const producer = await fs.getDoc(`producers/${user.uid}`);
          if (!producer) throw new ApiError(403, "FORBIDDEN", "Producer account required.");

          const sessions = await fs.query("sessions", {
            filters: [{ field: "producerUid", op: "EQUAL", value: user.uid }],
          });

          let totalSeconds = 0;
          let totalEarningsMinor = 0;

          for (const s of sessions) {
            totalSeconds += typeof s["acceptedSeconds"] === "number" ? s["acceptedSeconds"] : 0;
            totalEarningsMinor += typeof s["producerShareMinor"] === "number" ? s["producerShareMinor"] : 0;
          }

          return Response.json({
            totalMinutesWatched: Math.round(totalSeconds / 60),
            totalEarningsMinor,
            currency: producer["currency"] ?? "USD",
            sessionCount: sessions.length,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
