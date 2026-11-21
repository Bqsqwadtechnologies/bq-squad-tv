import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getWallet } from "@/lib/server/api";
import { requireVerifiedViewer } from "@/lib/server/access";
import { getPricingConfig } from "@/lib/server/pricing";
import { getGooglePlayProducts } from "@/lib/server/google-play";

export const Route = createFileRoute("/api/public/v1/wallet/google-play/products")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user } = await requireVerifiedViewer(request);
          const fs = await Firestore.create();
          const wallet = await getWallet(fs, user.uid);
          const config = await getPricingConfig(fs);
          return Response.json(
            getGooglePlayProducts(config, wallet.currency).map(
              ({ productId, title, description, credits, currency }) => ({
                productId,
                title,
                description,
                credits,
                currency,
              }),
            ),
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
