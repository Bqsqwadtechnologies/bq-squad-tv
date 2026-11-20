import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/referrals/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "finance");

          return Response.json({
            programActive: true,
            referrerBonusCredits: 50,
            refereeBonusCredits: 20,
            totalReferrals: 1240,
            activeReferrers: 312,
            pendingPayoutsCount: 4,
            pendingPayoutsTotal: "₦48,000",
            topReferrers: [
              { email: "influencer1@example.com", referralsCount: 84, totalBonus: "₦84,000", status: "paid" },
              { email: "promoter2@example.com", referralsCount: 52, totalBonus: "₦52,000", status: "paid" },
              { email: "user99@example.com", referralsCount: 18, totalBonus: "₦18,000", status: "pending" },
            ],
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
