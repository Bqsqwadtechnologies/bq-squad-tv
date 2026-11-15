import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getWallet, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/wallet")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const wallet = await getWallet(fs, user.uid);
          return Response.json({
            balanceMinor: wallet.balanceMinor,
            countryCurrency: wallet.currency,
            currency: wallet.currency,
            dailySpendLimitMinor: wallet.dailySpendLimitMinor,
            spentTodayMinor: wallet.spentTodayMinor,
          }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
