import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getWallet, requireUser } from "@/lib/server/api";
import { minorUnitDigits } from "@/lib/server/currency";

function symbolFor(currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0).find(part => part.type === "currency")?.value ?? currency;
  } catch { return currency; }
}

export const Route = createFileRoute("/api/public/v1/wallet/summary")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        const wallet = await getWallet(fs, user.uid);
        const digits = minorUnitDigits(wallet.currency);
        const formattedBalance = new Intl.NumberFormat("en", {
          style: "currency",
          currency: wallet.currency,
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(wallet.balanceMinor / (10 ** digits));
        return Response.json({
          balanceMinor: wallet.balanceMinor,
          currency: wallet.currency,
          currencyCode: wallet.currency,
          currencySymbol: symbolFor(wallet.currency),
          symbol: symbolFor(wallet.currency),
          minorUnitDigits: digits,
          formattedBalance,
          dailySpendLimitMinor: wallet.dailySpendLimitMinor, spentTodayMinor: wallet.spentTodayMinor,
        }, { headers: { "cache-control": "private, no-store" } });
      } catch (error) { return errorBody(error); }
    },
  } },
});
