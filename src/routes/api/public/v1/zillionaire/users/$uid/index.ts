import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { isProtectedZillionaire, requireZillionaireModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { requireStepUp } from "@/lib/server/zillionaire-access";
import { currencyForCountry } from "@/lib/server/currency";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    status: z.enum(["ACTIVE", "SUSPENDED", "RESTRICTED", "BANNED"]),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("force_signout_all"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("revoke_device"),
    deviceId: z.string().trim().min(1),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("change_email"),
    email: z.string().trim().email(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("mark_email_verified"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("send_password_reset"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("disable_parental_pin"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("change_country"),
    country: z.string().trim().length(2),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("delete_or_anonymize"),
    mode: z.enum(["soft_delete", "anonymize"]),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("send_message"),
    channel: z.enum(["in_app", "email", "both"]),
    subject: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(5000),
    templateId: z.string().optional(),
  }),
  z.object({
    action: z.literal("wallet_adjust"),
    type: z.enum(["CREDIT", "DEBIT"]),
    amountMinor: z.number().int().positive().max(100_000_000),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("reverse_payment"),
    paymentId: z.string().trim().min(1),
    reason: z.string().trim().min(3).max(1000),
  }),
]);

export const Route = createFileRoute("/api/public/v1/zillionaire/users/$uid/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const uid = params.uid;
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
            throw new ApiError(400, "USER_ID_INVALID", "Invalid user identifier.");
          }
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "users");

          const userDoc = await fs.get(`users/${uid}`);
          if (!userDoc) {
            throw new ApiError(404, "USER_NOT_FOUND", "User profile not found.");
          }

          // Fetch Wallet
          const walletDoc = (await fs.get(`wallets/${uid}`)) || {};
          const ledgerEntries = await fs.query(`wallets/${uid}/ledger`, { limit: 50 });

          // Fetch Payments
          const payments = await fs.query("payments", {
            filters: [{ field: "uid", op: "EQUAL", value: uid }],
            limit: 50,
          });

          // Fetch Receipts
          const receipts = await fs.query("receipts", {
            filters: [{ field: "uid", op: "EQUAL", value: uid }],
            limit: 50,
          });

          // Fetch Watch History
          const watchHistory = await fs.query("views", {
            filters: [{ field: "uid", op: "EQUAL", value: uid }],
            limit: 30,
          });

          // Fetch Devices
          const devices = await fs.query(`users/${uid}/devices`, { limit: 20 });

          // Fetch Comments
          const comments = await fs.query("comments", {
            filters: [{ field: "uid", op: "EQUAL", value: uid }],
            limit: 30,
          });

          // Fetch Notes
          const notes = await fs.query(`users/${uid}/notes`, { limit: 30 });

          return Response.json({
            profile: {
              id: uid,
              accountId: userDoc["accountId"] || null,
              email: userDoc["email"] || "",
              displayName: userDoc["displayName"] || "Viewer",
              phone: userDoc["phone"] || null,
              country: userDoc["countryCode"] || userDoc["country"] || null,
              createdAt: userDoc["createdAt"] || null,
              accountStatus:
                userDoc["accountStatus"] || (userDoc["suspended"] ? "SUSPENDED" : "ACTIVE"),
              emailVerified: Boolean(userDoc["emailVerified"]),
              parentalPinConfigured: Boolean(userDoc["parentalPinHash"]),
              riskScore: Number(userDoc["riskScore"] || 0),
              authRevocationTime: userDoc["authRevocationTime"] || null,
            },
            wallet: {
              balanceMinor: Number(walletDoc["balanceMinor"] || 0),
              currency: (walletDoc["currency"] as string) || (userDoc["preferredCurrency"] as string) || currencyForCountry(userDoc["countryCode"] || userDoc["country"]) || "USD",
              ledger: ledgerEntries.map((e) => ({
                id: e.__id || e["id"],
                kind: e["kind"] || "adjustment",
                description: e["description"] || "",
                amountMinor: Number(e["amountMinor"] || 0),
                balanceAfterMinor: Number(e["balanceAfterMinor"] || 0),
                createdAt: e["createdAt"] || null,
                reference: e["paymentReference"] || null,
              })),
            },
            payments: payments.map((p) => ({
              id: p.__id || p["id"],
              amountMinor: Number(p["amountMinor"] || 0),
              currency: p["currency"] || "NGN",
              status: p["status"] || "unknown",
              reference: p["reference"] || "",
              createdAt: p["createdAt"] || null,
            })),
            receipts: receipts.map((r) => ({
              id: r.__id || r["id"],
              receiptNumber: r["receiptNumber"] || `REC-${r.__id?.substring(0, 8) || "0000"}`,
              amountMinor: Number(r["amountMinor"] || 0),
              currency: r["currency"] || "NGN",
              type: r["type"] || "topup",
              createdAt: r["createdAt"] || null,
            })),
            watchHistory: watchHistory.map((w) => ({
              id: w.__id || w["id"],
              videoId: w["videoId"] || "",
              title: w["title"] || "Video",
              watchedSeconds: Number(w["watchedSeconds"] || 0),
              createdAt: w["createdAt"] || null,
            })),
            devices: devices.map((d) => ({
              id: d.__id || d["id"],
              deviceModel: d["deviceModel"] || "Unknown Device",
              platform: d["platform"] || "web",
              ipPrefix: d["ipPrefix"] || "0.0.0.*",
              lastActiveAt: d["lastActiveAt"] || null,
              revoked: Boolean(d["revoked"]),
            })),
            comments: comments.map((c) => ({
              id: c.__id || c["id"],
              videoId: c["videoId"] || "",
              text: c["text"] || "",
              createdAt: c["createdAt"] || null,
              hidden: Boolean(c["hidden"]),
            })),
            notes: notes.map((n) => ({
              id: n.__id || n["id"],
              text: n["text"] || "",
              authorUid: n["authorUid"] || "",
              createdAt: n["createdAt"] || null,
            })),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const uid = params.uid;
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
            throw new ApiError(400, "USER_ID_INVALID", "Invalid user identifier.");
          }
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "users");
          await enforceRateLimit(fs, "zillionaire-user-action:" + actor.uid, {
            limit: 30,
            windowMs: 60_000,
          });

          const body = await parseBody(request, actionSchema);
          const owner = isProtectedZillionaire(actor.email || "");
          if (owner && body.action === "wallet_adjust")
            requireStepUp(request, actor.uid, "wallet_adjust");
          if (owner && body.action === "reverse_payment")
            requireStepUp(request, actor.uid, "payment_reversal");
          if (owner && body.action === "delete_or_anonymize")
            requireStepUp(request, actor.uid, "permanent_delete");
          const userDoc = await fs.get(`users/${uid}`);
          if (!userDoc) {
            throw new ApiError(404, "USER_NOT_FOUND", "User not found.");
          }

          const targetEmail = typeof userDoc["email"] === "string" ? userDoc["email"] : null;
          if (isProtectedZillionaire(targetEmail)) {
            throw new ApiError(
              403,
              "OWNER_ACCOUNT_PROTECTED",
              "The protected ZILLIONAIRE owner account cannot be modified.",
            );
          }

          const now = new Date().toISOString();
          const auditId = crypto.randomUUID();

          if (body.action === "status") {
            await fs.set(`users/${uid}`, {
              ...userDoc,
              accountStatus: body.status,
              suspended: body.status === "SUSPENDED" || body.status === "BANNED",
              statusReason: body.reason,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: `user.status_${body.status.toLowerCase()}`,
              targetId: uid,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, status: body.status });
          }

          if (body.action === "force_signout_all") {
            await fs.set(`users/${uid}`, {
              ...userDoc,
              authRevocationTime: now,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "user.force_signout_all",
              targetId: uid,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, authRevocationTime: now });
          }

          if (body.action === "revoke_device") {
            const devDoc = await fs.get(`users/${uid}/devices/${body.deviceId}`);
            if (devDoc) {
              await fs.set(`users/${uid}/devices/${body.deviceId}`, {
                ...devDoc,
                revoked: true,
                revokedAt: now,
              });
            }
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "user.revoke_device",
              targetId: `${uid}:${body.deviceId}`,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true });
          }

          if (body.action === "change_email") {
            await fs.set(`users/${uid}`, {
              ...userDoc,
              email: body.email,
              emailVerified: false,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "user.change_email",
              targetId: uid,
              reason: body.reason,
              newEmail: body.email,
              createdAt: now,
            });
            return Response.json({ success: true, email: body.email });
          }

          if (body.action === "mark_email_verified") {
            await fs.set(`users/${uid}`, {
              ...userDoc,
              emailVerified: true,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "user.mark_email_verified",
              targetId: uid,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true });
          }

          if (body.action === "send_password_reset") {
            const resetEventId = crypto.randomUUID();
            const targetUserEmail = typeof userDoc["email"] === "string" ? userDoc["email"].trim() : null;
            let dispatchStatus = "DISPATCHED";
            let dispatchError: string | null = null;

            if (targetUserEmail) {
              try {
                // Dispatch password reset via Firebase Identity Toolkit
                const firebaseKey =
                  process.env.FIREBASE_WEB_API_KEY ||
                  process.env.VITE_FIREBASE_API_KEY ||
                  "AIzaSyD6QfAIfn_T0YWxxYKDbw8lZfj_s81N2ow";
                const resetResp = await fetch(
                  `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseKey}`,
                  {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ requestType: "PASSWORD_RESET", email: targetUserEmail }),
                  },
                );
                if (!resetResp.ok) {
                  const errJson = (await resetResp.json().catch(() => ({}))) as Record<string, unknown>;
                  dispatchStatus = "FAILED";
                  dispatchError = JSON.stringify(errJson);
                }
              } catch (e) {
                dispatchStatus = "FAILED";
                dispatchError = e instanceof Error ? e.message : String(e);
              }
            } else {
              dispatchStatus = "NO_EMAIL";
            }

            await fs.set(`passwordResetRequests/${resetEventId}`, {
              uid,
              email: userDoc["email"],
              requestedBy: actor.uid,
              reason: body.reason,
              status: dispatchStatus,
              error: dispatchError,
              createdAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "user.send_password_reset",
              targetId: uid,
              reason: body.reason,
              metadata: { dispatchStatus, error: dispatchError },
              createdAt: now,
            });
            return Response.json({ success: true, resetEventId, status: dispatchStatus });
          }

          if (body.action === "disable_parental_pin") {
            await fs.set(`users/${uid}`, {
              ...userDoc,
              parentalPinHash: null,
              parentalPinSalt: null,
              parentalPinVersion: null,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "user.disable_parental_pin",
              targetId: uid,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true });
          }

          if (body.action === "change_country") {
            // Check if wallet has settled transactions
            const ledger = await fs.query(`wallets/${uid}/ledger`, { limit: 1 });
            if (ledger.length > 0) {
              throw new ApiError(
                400,
                "WALLET_ESTABLISHED",
                "Country cannot be changed after the user wallet has established transactions.",
              );
            }
            await fs.set(`users/${uid}`, {
              ...userDoc,
              country: body.country,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "user.change_country",
              targetId: uid,
              country: body.country,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, country: body.country });
          }

          if (body.action === "delete_or_anonymize") {
            if (body.mode === "anonymize") {
              await fs.set(`users/${uid}`, {
                accountStatus: "ANONYMIZED",
                displayName: "Deleted User",
                email: `anonymized_${uid.substring(0, 8)}@deleted.bqsqwad.com`,
                phone: null,
                anonymizedAt: now,
                updatedAt: now,
              });
            } else {
              await fs.set(`users/${uid}`, {
                ...userDoc,
                accountStatus: "DELETED",
                deletedAt: now,
                updatedAt: now,
              });
            }
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: `user.${body.mode}`,
              targetId: uid,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, mode: body.mode });
          }

          if (body.action === "send_message") {
            const notifId = crypto.randomUUID();
            await fs.set(`notifications/${notifId}`, {
              uid,
              channel: body.channel,
              subject: body.subject,
              message: body.message,
              templateId: body.templateId || "custom",
              sentBy: actor.uid,
              status: "SENT",
              createdAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "user.send_message",
              targetId: uid,
              subject: body.subject,
              createdAt: now,
            });
            return Response.json({ success: true, notificationId: notifId });
          }

          if (body.action === "wallet_adjust") {
            const walletDoc = (await fs.get(`wallets/${uid}`)) || {};
            const currentBal = Number(walletDoc["balanceMinor"] || 0);
            const delta = body.type === "CREDIT" ? body.amountMinor : -body.amountMinor;
            const newBal = currentBal + delta;
            if (newBal < 0) {
              throw new ApiError(
                400,
                "INSUFFICIENT_FUNDS",
                "Adjustment would cause negative balance.",
              );
            }

            const ledgerId = crypto.randomUUID();
            await fs.set(`wallets/${uid}`, {
              ...walletDoc,
              balanceMinor: newBal,
              currency: walletDoc["currency"] || "NGN",
              updatedAt: now,
            });
            await fs.set(`wallets/${uid}/ledger/${ledgerId}`, {
              kind: body.type === "CREDIT" ? "manual_credit" : "manual_debit",
              description: `Owner adjustment: ${body.reason}`,
              amountMinor: delta,
              balanceAfterMinor: newBal,
              createdAt: now,
              adjustedBy: actor.uid,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: `wallet.${body.type.toLowerCase()}`,
              targetId: uid,
              amountMinor: body.amountMinor,
              newBalanceMinor: newBal,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, newBalanceMinor: newBal });
          }

          if (body.action === "reverse_payment") {
            const payDoc = await fs.get(`payments/${body.paymentId}`);
            if (!payDoc || payDoc["uid"] !== uid) {
              throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment not found for this user.");
            }
            const revId = crypto.randomUUID();
            await fs.set(`payments/${body.paymentId}`, {
              ...payDoc,
              status: "REVERSED",
              reversedAt: now,
              reversalReason: body.reason,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "payment.reversed",
              targetId: body.paymentId,
              userUid: uid,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, paymentId: body.paymentId });
          }

          throw new ApiError(400, "INVALID_ACTION", "Unrecognised action.");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
