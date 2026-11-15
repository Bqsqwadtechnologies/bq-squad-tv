import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { getPricingConfig } from "@/lib/server/pricing";
import { getGooglePlayProducts } from "@/lib/server/google-play";

export const Route = createFileRoute("/api/public/v1/wallet/google-play/products")({
  server: { handlers: { GET: async ({ request }) => {
    try {
      await requireUser(request);
      const fs = await Firestore.create();
      const config = await getPricingConfig(fs);
      return Response.json(getGooglePlayProducts(config).map(({ productId, title, description, credits }) => ({
        productId, title, description, credits,
      })));
    } catch (error) { return errorBody(error); }
  } } },
});
