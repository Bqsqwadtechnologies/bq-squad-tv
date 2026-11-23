import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getWallet, requireUser } from "@/lib/server/api";
import { getPricingConfig, getDefaultPricingConfig } from "@/lib/server/pricing";
import { getPaystackTopup } from "@/lib/server/paystack";

export const Route = createFileRoute("/api/public/v1/wallet/topups")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const wallet = await getWallet(fs, user.uid);
          let pricing;
          try {
            pricing = await getPricingConfig(fs);
          } catch {
            pricing = getDefaultPricingConfig();
          }
          const byCurrency = pricing["walletTopupsByCurrency"];
          const currencyOffers =
            byCurrency && typeof byCurrency === "object" && !Array.isArray(byCurrency)
              ? (byCurrency as Record<string, unknown>)[wallet.currency]
              : null;
          const raw =
            currencyOffers && typeof currencyOffers === "object" && !Array.isArray(currencyOffers)
              ? currencyOffers
              : wallet.currency === "NGN"
                ? pricing["walletTopups"]
                : null;

          const configuredPackages =
            raw && typeof raw === "object" && !Array.isArray(raw)
              ? Object.keys(raw as Record<string, unknown>)
                  .filter((packageId) => /^[A-Za-z0-9_-]{1,80}$/.test(packageId))
                  .flatMap((packageId) => {
                    try {
                      const offer = getPaystackTopup(pricing, packageId, wallet.currency);
                      return [{ packageId, ...offer, currency: wallet.currency }];
                    } catch {
                      return [];
                    }
                  })
              : [];

          if (configuredPackages.length > 0) {
            return Response.json(configuredPackages, { headers: { "cache-control": "no-store" } });
          }

          // Default packages are converted to the wallet's configured currency
          // using the current owner-maintained exchange-rate table. The payment
          // initializer independently validates the same currency and amount.
          const DEFAULT_ORDER = [
            "ngn_200", "ngn_500", "ngn_1000", "ngn_1500",
            "ngn_2000", "ngn_2500", "ngn_5000", "ngn_10000",
            "ngn_15000", "ngn_20000", "ngn_100000", "ngn_200000",
          ];
          const defaultPackages = DEFAULT_ORDER.flatMap((packageId) => {
            try {
              const offer = getPaystackTopup(pricing, packageId, wallet.currency);
              return [{ packageId, ...offer, currency: wallet.currency }];
            } catch {
              return [];
            }
          });
          return Response.json(defaultPackages, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
