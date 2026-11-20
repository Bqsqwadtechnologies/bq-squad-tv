import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/delivery/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "delivery");

          return Response.json({
            health: "HEALTHY",
            activeStreams: 142,
            averageBitrateMbps: 4.8,
            egressBandwidthGbps: 12.4,
            rebufferingRatioPercent: 0.12,
            hlsVariantDistribution: {
              "1080p": 54,
              "720p": 32,
              "480p": 11,
              "360p": 3,
            },
            edgeReplicas: [
              { region: "Lagos, NG", status: "ONLINE", latencyMs: 14, trafficPercent: 62 },
              { region: "Johannesburg, ZA", status: "ONLINE", latencyMs: 38, trafficPercent: 18 },
              { region: "London, UK", status: "ONLINE", latencyMs: 82, trafficPercent: 12 },
              { region: "Frankfurt, DE", status: "ONLINE", latencyMs: 88, trafficPercent: 8 },
            ],
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
