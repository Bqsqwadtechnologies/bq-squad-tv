import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { generateSequentialReceiptNumber, ReceiptRecord } from "@/lib/server/receipts";

const createReceiptSchema = z.object({
  uid: z.string().trim().min(1),
  type: z.enum(["topup", "charge", "refund", "payout"]),
  amountMinor: z.number().int().positive(),
  currency: z.string().trim().length(3).default("NGN"),
  description: z.string().trim().min(3).max(200),
  paymentReference: z.string().trim().min(1).default(() => `MANUAL-${crypto.randomUUID().substring(0, 8)}`),
  paymentProvider: z.string().trim().default("manual"),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/receipts/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "finance");

          const url = new URL(request.url);
          const query = url.searchParams.get("q")?.toLowerCase().trim();
          const targetUid = url.searchParams.get("uid")?.trim();

          const allReceipts = await fs.query("receipts", { limit: 100 });
          let filtered = allReceipts;

          if (targetUid) {
            filtered = filtered.filter((r) => r["uid"] === targetUid);
          }

          if (query) {
            filtered = filtered.filter(
              (r) =>
                (r["receiptNumber"] as string)?.toLowerCase().includes(query) ||
                (r["customerEmail"] as string)?.toLowerCase().includes(query) ||
                (r["paymentReference"] as string)?.toLowerCase().includes(query) ||
                (r["customerName"] as string)?.toLowerCase().includes(query),
            );
          }

          // Calculate summary metrics
          let totalVolumeMinor = 0;
          const userSpendMap = new Map<string, { email: string; totalMinor: number }>();

          for (const r of allReceipts) {
            const amount = Number(r["amountMinor"] || 0);
            totalVolumeMinor += amount;
            const uid = (r["uid"] as string) || "anonymous";
            const email = (r["customerEmail"] as string) || "unknown";
            const existing = userSpendMap.get(uid) || { email, totalMinor: 0 };
            existing.totalMinor += amount;
            userSpendMap.set(uid, existing);
          }

          let targetUserSpendMinor = 0;
          if (targetUid) {
            targetUserSpendMinor = userSpendMap.get(targetUid)?.totalMinor || 0;
          }

          return Response.json({
            receipts: filtered.map((r) => ({
              id: r.__id || r["id"],
              receiptNumber: r["receiptNumber"] || `BQ-REC-${r.__id?.substring(0, 6)}`,
              uid: r["uid"] || "",
              customerEmail: r["customerEmail"] || "",
              customerName: r["customerName"] || "Viewer",
              type: r["type"] || "topup",
              amountMinor: Number(r["amountMinor"] || 0),
              currency: r["currency"] || "NGN",
              paymentReference: r["paymentReference"] || "",
              paymentProvider: r["paymentProvider"] || "Paystack",
              status: r["status"] || "ISSUED",
              createdAt: r["createdAt"] || null,
              sentCount: Number(r["sentCount"] || 1),
            })),
            metrics: {
              totalReceipts: allReceipts.length,
              totalVolumeMinor,
              targetUserSpendMinor,
            },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "finance");

          const body = await parseBody(request, createReceiptSchema);
          const userDoc = await fs.get(`users/${body.uid}`);
          if (!userDoc) {
            throw new ApiError(404, "USER_NOT_FOUND", "Customer not found.");
          }

          const prefixMap = {
            topup: "REC" as const,
            charge: "REC" as const,
            payout: "PAY" as const,
            refund: "REF" as const,
          };
          const receiptNumber = await generateSequentialReceiptNumber(fs, prefixMap[body.type]);
          const receiptId = crypto.randomUUID();
          const now = new Date().toISOString();

          const record: ReceiptRecord = {
            id: receiptId,
            receiptNumber,
            uid: body.uid,
            customerEmail: (userDoc["email"] as string) || "viewer@bqsqwad.com",
            customerName: (userDoc["displayName"] as string) || "Viewer",
            type: body.type,
            amountMinor: body.amountMinor,
            currency: body.currency,
            paymentReference: body.paymentReference,
            paymentProvider: body.paymentProvider,
            status: "ISSUED",
            items: [
              {
                description: body.description,
                quantity: 1,
                unitAmountMinor: body.amountMinor,
                totalAmountMinor: body.amountMinor,
              },
            ],
            createdAt: now,
            sentCount: 1,
          };

          await fs.set(`receipts/${receiptId}`, record);

          await fs.set(`auditLog/${crypto.randomUUID()}`, {
            actorUid: actor.uid,
            action: "receipt.generated",
            receiptNumber,
            targetId: body.uid,
            amountMinor: body.amountMinor,
            createdAt: now,
          });

          return Response.json({ success: true, receipt: record });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
