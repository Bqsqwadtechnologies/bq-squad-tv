import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { requireVerifiedViewer } from "@/lib/server/access";

export const Route = createFileRoute("/api/public/v1/wallet/purchases")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user } = await requireVerifiedViewer(request);
          const fs = await Firestore.create();

          const ledger = await fs.query("walletLedger", {
            filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
          });

          ledger.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
            String(b["createdAt"] ?? "").localeCompare(String(a["createdAt"] ?? "")),
          );

          const items = ledger.map((doc: Record<string, unknown>) => ({
            id: doc["__id"],
            type: doc["type"] ?? "playback_charge",
            amountMinor: doc["amountMinor"],
            currency: doc["currency"] ?? "USD",
            sessionId: doc["sessionId"] ?? null,
            channelId: doc["channelId"] ?? null,
            createdAt: doc["createdAt"],
          }));

          return Response.json({ items });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
