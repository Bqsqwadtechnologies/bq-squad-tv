import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suspend"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("unsuspend"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("update_payout_account"),
    reason: z.string().trim().min(3).max(1000),
    payoutAccount: z.object({
      bankCode: z.string().trim().min(1).max(20),
      bankName: z.string().trim().min(2).max(100),
      accountNumber: z.string().trim().min(5).max(30),
      accountName: z.string().trim().min(2).max(120),
      currency: z.string().trim().min(3).max(5).default("NGN"),
    }),
  }),
]);

export const Route = createFileRoute("/api/public/v1/zillionaire/producers/$uid/actions")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const reviewer = await requireUser(request);
          const uid = params.uid;
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
            throw new ApiError(400, "USER_ID_INVALID", "Invalid producer identifier.");
          }

          const fs = await Firestore.create();
          await requireZillionaireModule(fs, reviewer, "producers");

          const producer = await fs.getDoc(`producers/${uid}`);
          if (!producer) {
            throw new ApiError(404, "PRODUCER_NOT_FOUND", "Producer account not found.");
          }

          const channels = await fs.query("channels", {
            filters: [{ field: "ownerUid", op: "EQUAL", value: uid }],
            limit: 50,
          });

          const earningsDoc = await fs.getDoc(`producerEarnings/${uid}`);
          const payouts = await fs.query("payouts", {
            filters: [{ field: "uid", op: "EQUAL", value: uid }],
            orderByField: "createdAt",
            descending: true,
            limit: 20,
          });

          return Response.json({
            producer: {
              uid,
              displayName: producer["displayName"] || producer["legalName"] || "Producer",
              companyName: producer["companyName"] || producer["businessName"] || "",
              legalName: producer["legalName"] || "",
              countryCode: producer["countryCode"] || "NG",
              entityType: producer["entityType"] || "individual",
              verificationStatus: producer["verificationStatus"] || "PENDING",
              planStatus: producer["planStatus"] || "ACTIVE",
              suspended: Boolean(producer["suspended"]),
              suspendedAt: producer["suspendedAt"] || null,
              suspendReason: producer["suspendReason"] || null,
              payoutAccount: producer["payoutAccount"] || null,
              submittedAt: producer["verificationSubmittedAt"] || producer["submittedAt"] || null,
              verifiedAt: producer["verifiedAt"] || null,
            },
            channels: channels.map((c) => ({
              id: c.__id || c["id"] || c["channelId"],
              title: c["title"] || c["name"] || "Untitled Channel",
              handle: c["handle"] || "",
              category: c["category"] || "entertainment",
              status: c["status"] || "published",
              pricePerMinuteMinor: Number(c["pricePerMinuteMinor"] || 0),
              verified: Boolean(c["verified"]),
            })),
            earnings: {
              balanceMinor: Number(earningsDoc?.["balanceMinor"] || 0),
              settledMinor: Number(earningsDoc?.["settledMinor"] || 0),
              lifetimeMinor: Number(earningsDoc?.["lifetimeMinor"] || 0),
              currency: (earningsDoc?.["currency"] as string) || "NGN",
              updatedAt: earningsDoc?.["updatedAt"] || null,
            },
            payouts: payouts.map((p) => ({
              id: p.__id || p["id"],
              amountMinor: Number(p["amountMinor"] || 0),
              currency: p["currency"] || "NGN",
              status: p["status"] || "REQUESTED",
              settlementReference: p["settlementReference"] || null,
              createdAt: p["createdAt"] || null,
            })),
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },

      POST: async ({ request, params }) => {
        try {
          const reviewer = await requireUser(request);
          const uid = params.uid;
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
            throw new ApiError(400, "USER_ID_INVALID", "Invalid producer identifier.");
          }

          const fs = await Firestore.create();
          await requireZillionaireModule(fs, reviewer, "producers");

          const producer = await fs.getDoc(`producers/${uid}`);
          if (!producer) {
            throw new ApiError(404, "PRODUCER_NOT_FOUND", "Producer account not found.");
          }

          const body = await parseBody(request, actionSchema);
          const now = new Date().toISOString();

          if (body.action === "suspend") {
            await fs.patchDoc(`producers/${uid}`, {
              suspended: true,
              suspendedAt: now,
              suspendedBy: reviewer.uid,
              suspendReason: body.reason,
            });

            await writeAuditLog(fs, {
              action: "producer_suspended",
              actorUid: reviewer.uid,
              targetType: "producer",
              targetId: uid,
              reason: body.reason,
              metadata: { producerUid: uid },
            });

            return Response.json({ ok: true, action: "suspend", suspended: true });
          }

          if (body.action === "unsuspend") {
            await fs.patchDoc(`producers/${uid}`, {
              suspended: false,
              unsuspendedAt: now,
              unsuspendedBy: reviewer.uid,
              unsuspendReason: body.reason,
            });

            await writeAuditLog(fs, {
              action: "producer_unsuspended",
              actorUid: reviewer.uid,
              targetType: "producer",
              targetId: uid,
              reason: body.reason,
              metadata: { producerUid: uid },
            });

            return Response.json({ ok: true, action: "unsuspend", suspended: false });
          }

          if (body.action === "update_payout_account") {
            await fs.patchDoc(`producers/${uid}`, {
              payoutAccount: body.payoutAccount,
              payoutAccountUpdatedAt: now,
              payoutAccountUpdatedBy: reviewer.uid,
              payoutAccountUpdateReason: body.reason,
            });

            await writeAuditLog(fs, {
              action: "producer_payout_account_updated",
              actorUid: reviewer.uid,
              targetType: "producer",
              targetId: uid,
              reason: body.reason,
              metadata: {
                producerUid: uid,
                bankCode: body.payoutAccount.bankCode,
                bankName: body.payoutAccount.bankName,
                accountNumberMasked: `****${body.payoutAccount.accountNumber.slice(-4)}`,
              },
            });

            return Response.json({ ok: true, action: "update_payout_account", payoutAccount: body.payoutAccount });
          }

          return Response.json({ error: "Invalid action" }, { status: 400 });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
