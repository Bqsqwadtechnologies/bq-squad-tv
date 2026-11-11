import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore, encodeFields, type FirestoreWrite } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import {
  elapsedSeconds,
  incrementalSessionCharge,
  maxAffordableSeconds,
  producerShareMinor,
  requireSessionOwned,
  safeAddMinor,
  toSessionSnapshot,
} from "../-shared";

function integer(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
}

export const Route = createFileRoute("/api/public/v1/sessions/$sessionId/end")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const sessionId = params.sessionId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(sessionId)) {
            throw new ApiError(400, "INVALID_REQUEST", "Invalid session id.");
          }
          const fs = await Firestore.create();
          const now = new Date();
          const nowIso = now.toISOString();
          const sessionPath = "sessions/" + sessionId;
          const walletPath = "wallets/" + user.uid;
          const initialSession = requireSessionOwned(await fs.getDoc(sessionPath), sessionId, user.uid);
          const producerUid = typeof initialSession["producerUid"] === "string" ? initialSession["producerUid"] as string : null;
          const producerPath = producerUid ? "producers/" + producerUid : null;
          const readPaths = [sessionPath, walletPath, ...(producerPath ? [producerPath] : [])];

          const snapshot = await fs.transact(readPaths, (docs) => {
            const session = requireSessionOwned(docs[0] ?? null, sessionId, user.uid);
            const wallet = docs[1] ?? {};
            const producer = producerPath ? docs[2] : null;
            const balance = integer(wallet["balanceMinor"]);
            if (session["active"] !== true) {
              return { result: toSessionSnapshot(sessionId, session, balance, null), writes: [] };
            }
            if (producerPath && !producer) {
              throw new ApiError(503, "PRODUCER_ACCOUNT_MISSING", "The channel producer account is not available for settlement.");
            }
            if (session["producerUid"] !== producerUid) {
              throw new ApiError(409, "SESSION_CHANGED", "The session changed while settlement was being processed.");
            }
            const currency = typeof wallet["currency"] === "string" ? wallet["currency"] as string : "NGN";
            // The final interval has no second player sample to corroborate progress.\n            // Do not charge it; only completed heartbeat intervals are billable.
            const rate = integer(session["ratePerMinuteMinor"]);
            const previouslyBilledSeconds = integer(session["billedSeconds"]);
            const today = nowIso.slice(0, 10);
            const spentToday = wallet["spentDate"] === today ? integer(wallet["spentTodayMinor"]) : 0;
            const dailyLimit = wallet["dailySpendLimitMinor"];
            const dailyRemaining = typeof dailyLimit === "number" && Number.isSafeInteger(dailyLimit)
              ? Math.max(0, dailyLimit - spentToday)
              : Number.MAX_SAFE_INTEGER;
            const affordableSeconds = maxAffordableSeconds(previouslyBilledSeconds, 0, rate, Math.min(balance, dailyRemaining));
            const charge = incrementalSessionCharge(previouslyBilledSeconds, affordableSeconds, rate);
            const newBalance = balance - charge.chargeMinor;
            const newSession = {
              billedSeconds: charge.billedSeconds,
              sessionTotalMinor: safeAddMinor(integer(session["sessionTotalMinor"]), charge.chargeMinor),
              active: false,
              endedAt: nowIso,
              endReason: "USER_ENDED",
            };
            const writes: FirestoreWrite[] = [
              {
                update: { name: fs.docName(sessionPath), fields: encodeFields(newSession) },
                updateMask: { fieldPaths: Object.keys(newSession) },
              },
              {
                update: {
                  name: fs.docName(walletPath),
                  fields: encodeFields({
                    balanceMinor: newBalance, spentDate: today,
                    spentTodayMinor: safeAddMinor(spentToday, charge.chargeMinor), currency, updatedAt: nowIso,
                  }),
                },
                updateMask: { fieldPaths: ["balanceMinor", "spentDate", "spentTodayMinor", "currency", "updatedAt"] },
              },
            ];
            if (charge.chargeMinor > 0) {
              writes.push({
                update: {
                  name: fs.docName("ledger/" + crypto.randomUUID()),
                  fields: encodeFields({
                    uid: user.uid, sessionId, kind: "watch_charge", description: "Channel viewing",
                    amountMinor: -charge.chargeMinor, createdAt: nowIso, idempotencyKey: sessionId + ":end",
                  }),
                },
                currentDocument: { exists: false },
              });
            }
            const platformShare = charge.chargeMinor - (producerPath && producer
              ? producerShareMinor(charge.chargeMinor, Math.min(10_000, Math.max(0, integer(session["producerShareBps"]))))
              : 0);
            if (platformShare > 0) {
              writes.push({
                update: {
                  name: fs.docName("ledger/" + crypto.randomUUID()),
                  fields: encodeFields({
                    uid: "platform",
                    sessionId,
                    kind: "platform_earning",
                    description: "Platform share of channel viewing",
                    amountMinor: platformShare,
                    createdAt: nowIso,
                    idempotencyKey: sessionId + ":end:platform",
                  }),
                },
                currentDocument: { exists: false },
              });
            }
            if (producerPath && producer && charge.chargeMinor > 0) {
              const shareBps = Math.min(10_000, Math.max(0, integer(session["producerShareBps"])));
              const producerShare = producerShareMinor(charge.chargeMinor, shareBps);
              if (producerShare > 0) {
                writes.push({
                  update: {
                    name: fs.docName(producerPath),
                    fields: encodeFields({
                      earningsBalanceMinor: safeAddMinor(integer(producer["earningsBalanceMinor"]), producerShare),
                      earningsLifetimeMinor: safeAddMinor(integer(producer["earningsLifetimeMinor"]), producerShare),
                      updatedAt: nowIso,
                    }),
                  },
                  updateMask: { fieldPaths: ["earningsBalanceMinor", "earningsLifetimeMinor", "updatedAt"] },
                });
                writes.push({
                  update: {
                    name: fs.docName("ledger/" + crypto.randomUUID()),
                    fields: encodeFields({
                      uid: producerUid, sessionId, kind: "producer_earning", description: "Channel viewing revenue",
                      amountMinor: producerShare, createdAt: nowIso, idempotencyKey: sessionId + ":end:producer",
                    }),
                  },
                  currentDocument: { exists: false },
                });
              }
            }
            return {
              result: toSessionSnapshot(sessionId, { ...session, ...newSession }, newBalance, null),
              writes,
            };
          });
          return Response.json(snapshot);
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
