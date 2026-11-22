import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { currencyForCountry, normalizeCountryCode } from "@/lib/server/currency";

export const Route = createFileRoute("/api/public/v1/profile/country")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const [profile, wallet] = await Promise.all([
            fs.getDoc("users/" + user.uid),
            fs.getDoc("wallets/" + user.uid),
          ]);
          const countryCode = normalizeCountryCode(profile?.["countryCode"]);
          const currency =
            typeof wallet?.["currency"] === "string"
              ? (wallet["currency"] as string)
              : wallet
                ? "NGN"
                : currencyForCountry(countryCode);
          return Response.json(
            { countryCode, currency, walletCurrencyLocked: Boolean(wallet) },
            {
              headers: { "cache-control": "no-store" },
            },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async () => {
        return Response.json(
          {
            error: "COUNTRY_LOCKED",
            message: "Your country is set automatically. If it is wrong, contact tv@bqsqwad.com.",
          },
          { status: 403, headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
