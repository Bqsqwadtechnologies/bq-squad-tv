import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/ads/campaigns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const fs = await Firestore.create();
          const campaigns = await fs.listDocs("adCampaigns");
          const active = campaigns.filter((c) => c["status"] === "active");

          return Response.json({ items: active });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
