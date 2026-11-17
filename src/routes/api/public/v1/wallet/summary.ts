import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getWallet, requireUser } from "@/lib/server/api";
import { minorUnitDigits } from "@/lib/server/currency";
import { currencySymbol, formatMinorCurrency } from "@/lib/server/currency-format";

export const Route = createFileRoute("/api/public/v1/wallet/summary")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        const wallet = await getWallet(fs, user.uid);
        const digits = minorUnitDigits(wallet.currency);
        const formattedBalance = formatMinorCurrency(wallet.balanceMinor, wallet.currency);
        return Response.json({
          balanceMinor: wallet.balanceMinor,
          currency: wallet.currency,
          currencyCode: wallet.currency,
          currencySymbol: currencySymbol(wallet.currency),
          symbol: currencySymbol(wallet.currency),
          minorUnitDigits: digits,
          formattedBalance,
          dailySpendLimitMinor: wallet.dailySpendLimitMinor, spentTodayMinor: wallet.spentTodayMinor,
        }, { headers: { "cache-control": "private, no-store" } });
      } catch (error) { return errorBody(error); }
    },
  } },
});
