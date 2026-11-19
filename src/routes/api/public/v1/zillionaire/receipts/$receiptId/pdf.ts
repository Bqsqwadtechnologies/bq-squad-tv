import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { renderReceiptHtml, ReceiptRecord } from "@/lib/server/receipts";

export const Route = createFileRoute("/api/public/v1/zillionaire/receipts/$receiptId/pdf")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const receiptId = params.receiptId;
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "finance");

          const receiptDoc = await fs.get(`receipts/${receiptId}`);
          if (!receiptDoc) {
            throw new ApiError(404, "RECEIPT_NOT_FOUND", "Receipt not found.");
          }

          const record: ReceiptRecord = {
            id: receiptId,
            receiptNumber: (receiptDoc["receiptNumber"] as string) || `BQ-REC-${receiptId.substring(0, 6)}`,
            uid: (receiptDoc["uid"] as string) || "",
            customerEmail: (receiptDoc["customerEmail"] as string) || "",
            customerName: (receiptDoc["customerName"] as string) || "Viewer",
            type: (receiptDoc["type"] as any) || "topup",
            amountMinor: Number(receiptDoc["amountMinor"] || 0),
            currency: (receiptDoc["currency"] as string) || "NGN",
            paymentReference: (receiptDoc["paymentReference"] as string) || "",
            paymentProvider: (receiptDoc["paymentProvider"] as string) || "Paystack",
            status: (receiptDoc["status"] as any) || "ISSUED",
            items: Array.isArray(receiptDoc["items"])
              ? receiptDoc["items"]
              : [
                  {
                    description: "BQ SQWAD TV Service Transaction",
                    quantity: 1,
                    unitAmountMinor: Number(receiptDoc["amountMinor"] || 0),
                    totalAmountMinor: Number(receiptDoc["amountMinor"] || 0),
                  },
                ],
            createdAt: (receiptDoc["createdAt"] as string) || new Date().toISOString(),
            sentCount: Number(receiptDoc["sentCount"] || 1),
          };

          const html = renderReceiptHtml(record);

          return new Response(html, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Disposition": `inline; filename="${record.receiptNumber}.html"`,
            },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
