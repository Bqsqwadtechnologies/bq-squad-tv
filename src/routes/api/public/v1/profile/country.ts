import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { currencyForCountry, normalizeCountryCode } from "@/lib/server/currency";

const schema = z.object({ countryCode: z.string().regex(/^[A-Za-z]{2}$/) });

export const Route = createFileRoute("/api/public/v1/profile/country")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        const [profile, wallet] = await Promise.all([
          fs.getDoc("users/" + user.uid),
          fs.getDoc("wallets/" + user.uid),
        ]);
        const countryCode = normalizeCountryCode(profile?.["countryCode"]);
        const currency = typeof wallet?.["currency"] === "string"
          ? wallet["currency"] as string
          : wallet ? "NGN" : currencyForCountry(countryCode);
        return Response.json({ countryCode, currency, walletCurrencyLocked: Boolean(wallet) }, {
          headers: { "cache-control": "no-store" },
        });
      } catch (error) { return errorBody(error); }
    },
    POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      const countryCode = normalizeCountryCode(body.countryCode);
      if (!countryCode) throw new ApiError(400, "COUNTRY_CODE_INVALID", "Choose a valid two-letter country code.");
      const currency = currencyForCountry(countryCode);
      const fs = await Firestore.create();
      const wallet = await fs.getDoc("wallets/" + user.uid);
      const establishedCurrency = typeof wallet?.["currency"] === "string"
        ? wallet["currency"] as string : wallet ? "NGN" : null;
      if (establishedCurrency && establishedCurrency !== currency) {
        throw new ApiError(409, "WALLET_CURRENCY_LOCKED", "Your wallet currency is already established. Changing your country cannot convert or relabel its balance.");
      }
      await fs.patchDoc("users/" + user.uid, {
        countryCode,
        preferredCurrency: currency,
        updatedAt: new Date().toISOString(),
      });
      return Response.json({ countryCode, currency, walletCurrencyLocked: Boolean(wallet) }, {
        headers: { "cache-control": "no-store" },
      });
    } catch (error) { return errorBody(error); }
  } } },
});
