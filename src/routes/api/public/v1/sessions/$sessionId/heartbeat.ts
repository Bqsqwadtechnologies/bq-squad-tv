import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields, type FirestoreWrite } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { releaseSessionLease, renewSessionLease } from "@/lib/server/session-limits";
import {
  elapsedSeconds,
  incrementalSessionCharge,
  maxAffordableSeconds,
  producerShareMinor,
  requireSessionOwned,
  safeAddMinor,
  toSessionSnapshot,
  reportedPlaybackSeconds,
  type ReportedPlaybackState,
} from "../-shared";

const bodySchema = z.object({
  clientSequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  playbackState: z.enum(["playing", "paused", "buffering", "idle", "ended"]),
  playbackPositionMs: z.number().int().nonnegative().max(31_536_000_000),
});

function integer(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
}

export const Route = createFileRoute("/api/public/v1/sessions/$sessionId/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const sessionId = params.sessionId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(sessionId)) {
            throw new ApiError(400, "INVALID_REQUEST", "Invalid session id.");
          }
          let rawBody: unknown;
          try { rawBody = await request.json(); }
          catch { throw new ApiError(400, "INVALID_REQUEST", "Request body must be valid JSON."); }
          const { clientSequence, playbackState, playbackPositionMs } = bodySchema.parse(rawBody);
          const fs = await Firestore.create();
          const now = new Date();
          const nowIso = now.toISOString();
          const sessionPath = "sessions/" + sessionId;
          const walletPath = "wallets/" + user.uid;
          const receiptPath = sessionPath + "/heartbeats/" + clientSequence;
          const activeSessionsPath = "activeSessions/" + user.uid;
          const initialSession = requireSessionOwned(await fs.getDoc(sessionPath), sessionId, user.uid);
          const producerUid = typeof initialSession["producerUid"] === "string" ? initialSession["producerUid"] as string : null;
          const producerPath = producerUid ? "producers/" + producerUid : null;
          const readPaths = [sessionPath, walletPath, receiptPath, activeSessionsPath, ...(producerPath ? [producerPath] : [])];

          const response = await fs.transact(readPaths, (docs) => {
            const session = requireSessionOwned(docs[0] ?? null, sessionId, user.uid);
            const wallet = docs[1] ?? {};
            const existingReceipt = docs[2];
            const activeSessionDoc = docs[3] ?? {};
            const producer = producerPath ? docs[4] : null;
            if (existingReceipt && typeof existingReceipt["response"] === "object" && existingReceipt["response"] !== null) {
              return { result: existingReceipt["response"] as Record<string, unknown>, writes: [] };
            }
            if (session["active"] !== true) {
              throw new ApiError(409, "SESSION_INACTIVE", "This playback session is no longer active.");
            }
            if (producerPath && !producer) {
              throw new ApiError(503, "PRODUCER_ACCOUNT_MISSING", "The channel producer account is not available for settlement.");
            }
            if (session["producerUid"] !== producerUid) {
              throw new ApiError(409, "SESSION_CHANGED", "The session changed while the heartbeat was being processed.");
            }
            const lastSequence = integer(session["lastClientSequence"]);
            if (clientSequence <= lastSequence) {
              throw new ApiError(409, "HEARTBEAT_REPLAY", "This heartbeat sequence has already been processed.");
            }

            const elapsed = elapsedSeconds(session["lastHeartbeatAt"], now);
            const billableSeconds = reportedPlaybackSeconds(
              session["lastPlaybackState"], playbackState as ReportedPlaybackState,
              session["lastPlaybackPositionMs"], playbackPositionMs, elapsed,
            );
            const rate = integer(session["ratePerMinuteMinor"]);
            const previousBilledSeconds = integer(session["billedSeconds"]);
            const balance = integer(wallet["balanceMinor"]);
            const today = nowIso.slice(0, 10);
            const spentToday = wallet["spentDate"] === today ? integer(wallet["spentTodayMinor"]) : 0;
            const dailyLimit = wallet["dailySpendLimitMinor"];
            const dailyRemaining = typeof dailyLimit === "number" && Number.isSafeInteger(dailyLimit)
              ? Math.max(0, dailyLimit - spentToday)
              : Number.MAX_SAFE_INTEGER;
            const affordableSeconds = maxAffordableSeconds(previousBilledSeconds, billableSeconds, rate, Math.min(balance, dailyRemaining));
            const charge = incrementalSessionCharge(previousBilledSeconds, affordableSeconds, rate);
            const missedTwoHeartbeats = elapsed > 45;
            const exhausted = rate > 0 && (
              affordableSeconds < billableSeconds ||
              balance <= charge.chargeMinor ||
              dailyRemaining <= charge.chargeMinor
            );
            const active = !missedTwoHeartbeats && !exhausted;
            const newBalance = balance - charge.chargeMinor;
            const currency = typeof session["currency"] === "string" ? session["currency"] as string :
              typeof wallet["currency"] === "string" ? wallet["currency"] as string : "NGN";
            if (typeof wallet["currency"] === "string" && wallet["currency"] !== currency) {
              throw new ApiError(409, "WALLET_CURRENCY_MISMATCH", "The wallet currency changed during this playback session.");
            }
            const newSpentToday = safeAddMinor(spentToday, charge.chargeMinor);
            const newSessionTotal = safeAddMinor(integer(session["sessionTotalMinor"]), charge.chargeMinor);
            const newSession = {
              billedSeconds: charge.billedSeconds,
              sessionTotalMinor: newSessionTotal,
              lastHeartbeatAt: nowIso,
              lastClientSequence: clientSequence,
              lastPlaybackState: playbackState,
              lastPlaybackPositionMs: playbackPositionMs,
              active,
              ...(active ? {} : { endedAt: nowIso, endReason: missedTwoHeartbeats ? "HEARTBEAT_TIMEOUT" : "WALLET_LIMIT" }),
            };
            const nowMs = now.getTime();
            const liveSessions = active
              ? renewSessionLease(activeSessionDoc["sessions"], sessionId, nowMs)
              : releaseSessionLease(activeSessionDoc["sessions"], sessionId, nowMs);

            const writes: FirestoreWrite[] = [
              {
                update: { name: fs.docName(sessionPath), fields: encodeFields(newSession) },
                updateMask: { fieldPaths: Object.keys(newSession) },
              },
              {
                update: { name: fs.docName(walletPath), fields: encodeFields({
                  balanceMinor: newBalance, spentDate: today, spentTodayMinor: newSpentToday, currency, updatedAt: nowIso,
                }) },
                updateMask: { fieldPaths: ["balanceMinor", "spentDate", "spentTodayMinor", "currency", "updatedAt"] },
              },
              {
                update: {
                  name: fs.docName(activeSessionsPath),
                  fields: encodeFields({ sessions: liveSessions, updatedAt: nowIso }),
                },
                updateMask: { fieldPaths: ["sessions", "updatedAt"] },
              },
            ];
            if (charge.chargeMinor > 0) {
              writes.push({
                update: {
                  name: fs.docName("ledger/" + crypto.randomUUID()),
                  fields: encodeFields({
                    uid: user.uid, sessionId, kind: "watch_charge", description: "Channel viewing",
                    amountMinor: -charge.chargeMinor, currency, createdAt: nowIso, idempotencyKey: sessionId + ":" + clientSequence,
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
                    amountMinor: platformShare, currency,
                    createdAt: nowIso,
                    idempotencyKey: sessionId + ":" + clientSequence + ":platform",
                  }),
                },
                currentDocument: { exists: false },
              });
            }
            if (producerPath && producer && charge.chargeMinor > 0) {
              const shareBps = Math.min(10_000, Math.max(0, integer(session["producerShareBps"])));
              const producerShare = producerShareMinor(charge.chargeMinor, shareBps);
              if (producerShare > 0) {
                const currentBalances = producer["earningsBalanceByCurrency"] && typeof producer["earningsBalanceByCurrency"] === "object"
                  ? producer["earningsBalanceByCurrency"] as Record<string, unknown> : {};
                const currentLifetime = producer["earningsLifetimeByCurrency"] && typeof producer["earningsLifetimeByCurrency"] === "object"
                  ? producer["earningsLifetimeByCurrency"] as Record<string, unknown> : {};
                const currentCurrencyBalance = typeof currentBalances[currency] === "number"
                  ? integer(currentBalances[currency])
                  : currency === "NGN" ? integer(producer["earningsBalanceMinor"]) : 0;
                const currentCurrencyLifetime = typeof currentLifetime[currency] === "number"
                  ? integer(currentLifetime[currency])
                  : currency === "NGN" ? integer(producer["earningsLifetimeMinor"]) : 0;
                const nextBalances = { ...currentBalances, [currency]: safeAddMinor(currentCurrencyBalance, producerShare) };
                const nextLifetime = { ...currentLifetime, [currency]: safeAddMinor(currentCurrencyLifetime, producerShare) };
                const producerEarningsFields: Record<string, unknown> = {
                  earningsBalanceByCurrency: nextBalances,
                  earningsLifetimeByCurrency: nextLifetime,
                  updatedAt: nowIso,
                  ...(currency === "NGN" ? {
                    earningsBalanceMinor: nextBalances["NGN"],
                    earningsLifetimeMinor: nextLifetime["NGN"],
                  } : {}),
                };
                writes.push({
                  update: {
                    name: fs.docName(producerPath),
                    fields: encodeFields(producerEarningsFields),
                  },
                  updateMask: { fieldPaths: Object.keys(producerEarningsFields) },
                });
                writes.push({
                  update: {
                    name: fs.docName("ledger/" + crypto.randomUUID()),
                    fields: encodeFields({
                      uid: producerUid, sessionId, kind: "producer_earning", description: "Channel viewing revenue",
                      amountMinor: producerShare, currency, createdAt: nowIso, idempotencyKey: sessionId + ":" + clientSequence + ":producer",
                    }),
                  },
                  currentDocument: { exists: false },
                });
              }
            }
            const snapshot = toSessionSnapshot(sessionId, { ...session, ...newSession }, newBalance, null);
            writes.push({
              update: {
                name: fs.docName(receiptPath),
                fields: encodeFields({ clientSequence, createdAt: nowIso, response: snapshot }),
              },
              currentDocument: { exists: false },
            });
            return { result: snapshot, writes };
          });
          return Response.json(response);
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
