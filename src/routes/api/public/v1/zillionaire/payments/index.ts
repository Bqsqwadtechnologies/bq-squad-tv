import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/payments/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "payments");

          const url = new URL(request.url);
          const status = url.searchParams.get("status")?.toUpperCase().trim();
          const q = url.searchParams.get("q")?.toLowerCase().trim();

          const allPayments = await fs.query("payments", {
            orderByField: "createdAt",
            descending: true,
            limit: 200,
          });

          let filtered = allPayments;

          if (status && status !== "ALL") {
            if (status === "REVERSED") {
              filtered = filtered.filter((p) => p["reversed"] === true || p["status"] === "REVERSED");
            } else if (status === "COMPLETED") {
              filtered = filtered.filter((p) => p["status"] === "COMPLETED" && !p["reversed"]);
            } else if (status === "FAILED") {
              filtered = filtered.filter((p) => p["status"] === "FAILED");
            }
          }

          if (q) {
            filtered = filtered.filter(
              (p) =>
                String(p.__id || p["id"] || "").toLowerCase().includes(q) ||
                ((p["uid"] as string) || "").toLowerCase().includes(q) ||
                ((p["reference"] as string) || "").toLowerCase().includes(q) ||
                ((p["gateway"] as string) || "").toLowerCase().includes(q),
            );
          }

          return Response.json({
            payments: filtered.map((p) => {
              const paymentId = String(p.__id || p["id"] || "");
              const isReversed = Boolean(p["reversed"] || p["status"] === "REVERSED");
              return {
                id: paymentId,
                uid: p["uid"] || "",
                amountMinor: Number(p["amountMinor"] || 0),
                currency: p["currency"] || "NGN",
                gateway: p["gateway"] || (paymentId.startsWith("paystack_") ? "paystack" : "googleplay"),
                reference: p["reference"] || paymentId,
                status: isReversed ? "REVERSED" : (p["status"] || "COMPLETED"),
                reversed: isReversed,
                reversedAt: p["reversedAt"] || null,
                reversalReason: p["reversalReason"] || null,
                reconciliationStatus: isReversed ? "REVERSED_OK" : "MATCHED",
                createdAt: p["createdAt"] || null,
              };
            }),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
