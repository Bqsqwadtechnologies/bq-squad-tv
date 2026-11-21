import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getWallet } from "@/lib/server/api";
import { requireVerifiedViewer } from "@/lib/server/access";
import { minorUnitDigits } from "@/lib/server/currency";
import { currencySymbol, formatMinorCurrency } from "@/lib/server/currency-format";

export const Route = createFileRoute("/api/public/v1/wallet/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user } = await requireVerifiedViewer(request);
          const fs = await Firestore.create();
          const wallet = await getWallet(fs, user.uid);
          const digits = minorUnitDigits(wallet.currency);
          const formattedBalance = formatMinorCurrency(wallet.balanceMinor, wallet.currency);
          const requestedSessionId = new URL(request.url).searchParams.get("sessionId");
          let chargedSoFarThisFilm: {
            amountMinor: number;
            formattedAmount: string;
            currencyCode: string;
          } | null = null;
          if (requestedSessionId && /^[A-Za-z0-9_-]{1,100}$/.test(requestedSessionId)) {
            const session = await fs.getDoc("sessions/" + requestedSessionId);
            if (session?.["uid"] === user.uid) {
              const amountMinor =
                typeof session["sessionTotalMinor"] === "number" &&
                Number.isSafeInteger(session["sessionTotalMinor"])
                  ? (session["sessionTotalMinor"] as number)
                  : 0;
              const sessionCurrency =
                typeof session["currency"] === "string"
                  ? (session["currency"] as string)
                  : wallet.currency;
              chargedSoFarThisFilm = {
                amountMinor,
                formattedAmount: formatMinorCurrency(amountMinor, sessionCurrency),
                currencyCode: sessionCurrency,
              };
            }
          }
          return Response.json(
            {
              balanceMinor: wallet.balanceMinor,
              currency: wallet.currency,
              currencyCode: wallet.currency,
              currencySymbol: currencySymbol(wallet.currency),
              symbol: currencySymbol(wallet.currency),
              minorUnitDigits: digits,
              formattedBalance,
              chargedSoFarThisFilm,
              dailySpendLimitMinor: wallet.dailySpendLimitMinor,
              spentTodayMinor: wallet.spentTodayMinor,
            },
            { headers: { "cache-control": "private, no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
