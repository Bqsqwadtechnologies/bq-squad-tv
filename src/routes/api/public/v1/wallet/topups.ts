import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getWallet, requireUser } from "@/lib/server/api";
import { getPricingConfig } from "@/lib/server/pricing";
import { getPaystackTopup } from "@/lib/server/paystack";

export const Route = createFileRoute("/api/public/v1/wallet/topups")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        const wallet = await getWallet(fs, user.uid);
        const pricing = await getPricingConfig(fs);
        const raw = pricing["walletTopups"];
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return Response.json([]);
        const packages = Object.keys(raw as Record<string, unknown>)
          .filter(packageId => /^[A-Za-z0-9_-]{1,80}$/.test(packageId))
          .flatMap(packageId => {
            try {
              const offer = getPaystackTopup(pricing, packageId, wallet.currency);
              return [{ packageId, ...offer, currency: wallet.currency }];
            } catch {
              return [];
            }
          });
        return Response.json(packages, { headers: { "cache-control": "no-store" } });
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
