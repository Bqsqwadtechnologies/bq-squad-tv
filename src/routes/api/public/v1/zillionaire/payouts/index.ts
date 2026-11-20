import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

const actionSchema = z.object({
  payoutId: z.string().trim().min(5).max(100),
  action: z.enum(["HOLD", "UNHOLD"]),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/payouts/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "payouts");

          const url = new URL(request.url);
          const status = url.searchParams.get("status")?.toUpperCase().trim();
          const q = url.searchParams.get("q")?.toLowerCase().trim();

          const allPayouts = await fs.query("payouts", {
            orderByField: "createdAt",
            descending: true,
            limit: 200,
          });

          let filtered = allPayouts;

          if (status && status !== "ALL") {
            filtered = filtered.filter((p) => (p["status"] as string)?.toUpperCase() === status);
          }

          if (q) {
            filtered = filtered.filter(
              (p) =>
                String(p.__id || p["id"] || "").toLowerCase().includes(q) ||
                ((p["uid"] as string) || "").toLowerCase().includes(q) ||
                ((p["settlementReference"] as string) || "").toLowerCase().includes(q) ||
                ((p["reversalReference"] as string) || "").toLowerCase().includes(q),
            );
          }

          return Response.json({
            payouts: filtered.map((p) => ({
              id: p.__id || p["id"],
              uid: p["uid"] || "",
              amountMinor: Number(p["amountMinor"] || 0),
              paidAmountMinor: p["paidAmountMinor"] !== undefined ? Number(p["paidAmountMinor"]) : undefined,
              currency: p["currency"] || "NGN",
              status: p["status"] || "REQUESTED",
              payoutAccount: p["payoutAccount"] || null,
              settlementReference: p["settlementReference"] || null,
              reversalReference: p["reversalReference"] || null,
              reviewReason: p["reviewReason"] || null,
              settlementReason: p["settlementReason"] || null,
              holdReason: p["holdReason"] || null,
              reversalReason: p["reversalReason"] || null,
              failureReason: p["failureReason"] || null,
              createdAt: p["createdAt"] || p["requestedAt"] || null,
              reviewedAt: p["reviewedAt"] || null,
              settledAt: p["settledAt"] || null,
              reversedAt: p["reversedAt"] || null,
            })),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const body = await parseBody(request, actionSchema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "payouts");

          const payoutPath = "payouts/" + body.payoutId;
          const payout = await fs.getDoc(payoutPath);
          if (!payout) {
            throw new ApiError(404, "PAYOUT_NOT_FOUND", "The payout request was not found.");
          }

          const now = new Date().toISOString();
          const nextStatus = body.action === "HOLD" ? "HELD" : "REQUESTED";

          await fs.set(payoutPath, {
            ...payout,
            status: nextStatus,
            holdReason: body.action === "HOLD" ? body.reason : null,
            heldAt: body.action === "HOLD" ? now : null,
            heldBy: body.action === "HOLD" ? actor.uid : null,
            updatedAt: now,
          });

          await fs.set("auditLog/" + crypto.randomUUID(), {
            actorUid: actor.uid,
            action: body.action === "HOLD" ? "payout.held" : "payout.unheld",
            targetType: "payout",
            targetId: body.payoutId,
            reason: body.reason,
            createdAt: now,
          });

          return Response.json({ success: true, payoutId: body.payoutId, status: nextStatus });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
