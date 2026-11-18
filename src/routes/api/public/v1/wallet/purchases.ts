import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/wallet/purchases")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          // Get wallet ledger records for viewing charges & top-ups
          const ledgerDocs = await fs.listDocs(`walletLedgers/${user.uid}/entries`);
          ledgerDocs.sort((a, b) => String(b["createdAt"] ?? "").localeCompare(String(a["createdAt"] ?? "")));

          const purchases = ledgerDocs.map((doc) => ({
            id: doc["id"] ?? doc["reference"] ?? "",
            type: doc["type"] ?? "viewing_charge",
            amountMinor: doc["amountMinor"] ?? 0,
            currency: doc["currency"] ?? "USD",
            title: doc["title"] ?? (doc["type"] === "top_up" ? "Wallet Top-up" : "Stream Viewing"),
            sessionId: doc["sessionId"] ?? null,
            receiptRef: doc["receiptRef"] ?? `RCP-${String(doc["id"] ?? "").slice(-6).toUpperCase()}`,
            createdAt: doc["createdAt"] ?? new Date().toISOString(),
          }));

          return Response.json({ items: purchases });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
