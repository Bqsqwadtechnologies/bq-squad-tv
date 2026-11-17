import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields, type FirestoreWrite } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { signSessionLeaseToken, verifySessionLeaseToken } from "@/lib/server/session-lease-token";
import { releaseSessionLease, renewSessionLease } from "@/lib/server/session-limits";
import { estimatePlaybackProgressBytes, recordExpectedStorageEgressProgress, releaseExpectedStorageEgress } from "@/lib/server/storage/expected-egress";
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
  leaseToken: z.string().max(2048).optional(),
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
          const { clientSequence, playbackState, playbackPositionMs, leaseToken } = bodySchema.parse(rawBody);
          const fs = await Firestore.create();
          const now = new Date();
          const nowIso = now.toISOString();
          const sessionPath = "sessions/" + sessionId;
          const walletPath = "wallets/" + user.uid;
          const receiptPath = sessionPath + "/heartbeats/" + clientSequence;
          const activeSessionsPath = "activeSessions/" + user.uid;
          const budgetMonth = nowIso.slice(0, 7);
          const monthlyUsagePath = "walletMonthlyUsage/" + user.uid + "_" + budgetMonth;
          const monthlyBudgetAlertPath = "walletBudgetAlerts/" + user.uid + "_" + budgetMonth;
          const lowBalanceAlertPath = "walletLowBalanceAlerts/" + user.uid + "_" + budgetMonth;
          const initialSession = requireSessionOwned(await fs.getDoc(sessionPath), sessionId, user.uid);
          if (leaseToken) {
            const lease = await verifySessionLeaseToken(leaseToken, sessionId);
            const lastSequence = integer(initialSession["lastClientSequence"]);
            const isIdempotentRetry = clientSequence === lastSequence && lease.seq === clientSequence - 1;
            const isNextHeartbeat = clientSequence === lastSequence + 1 && lease.seq === lastSequence &&
              lease.billedSeconds === integer(initialSession["billedSeconds"]) &&
              lease.positionMs === integer(initialSession["lastPlaybackPositionMs"]);
            if (!isIdempotentRetry && !isNextHeartbeat) {
              throw new ApiError(409, "HEARTBEAT_LEASE_STALE", "The playback lease is out of date. Refresh the playback session.");
            }
          }
          const producerUid = typeof initialSession["producerUid"] === "string" ? initialSession["producerUid"] as string : null;
          const producerPath = producerUid ? "producers/" + producerUid : null;
          const readPaths = [
            sessionPath, walletPath, receiptPath, activeSessionsPath,
            monthlyUsagePath, monthlyBudgetAlertPath, lowBalanceAlertPath,
            ...(producerPath ? [producerPath] : []),
          ];

          const elapsedForEgress = elapsedSeconds(initialSession["lastHeartbeatAt"], now);
          const playbackSecondsForEgress = reportedPlaybackSeconds(
            initialSession["lastPlaybackState"], playbackState as ReportedPlaybackState,
            initialSession["lastPlaybackPositionMs"], playbackPositionMs, elapsedForEgress,
          );
          const rawBitrate = integer(initialSession["streamBitrateBps"], 1_500_000);
          const egressBitrate = rawBitrate >= 64_000 && rawBitrate <= 25_000_000 ? rawBitrate : 1_500_000;
          const expectedEgressBytes = estimatePlaybackProgressBytes(egressBitrate, playbackSecondsForEgress);

          const response = await fs.transact(readPaths, (docs) => {
            const session = requireSessionOwned(docs[0] ?? null, sessionId, user.uid);
            const wallet = docs[1] ?? {};
            const existingReceipt = docs[2];
            const activeSessionDoc = docs[3] ?? {};
            const monthlyUsage = docs[4] ?? {};
            const monthlyBudgetAlert = docs[5];
            const lowBalanceAlert = docs[6];
            const producer = producerPath ? docs[7] : null;
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
            const dailyLimit = Object.prototype.hasOwnProperty.call(session, "dailySpendLimitMinor")
              ? session["dailySpendLimitMinor"]
              : wallet["dailySpendLimitMinor"];
            const dailyRemaining = typeof dailyLimit === "number" && Number.isSafeInteger(dailyLimit)
              ? Math.max(0, dailyLimit - spentToday)
              : Number.MAX_SAFE_INTEGER;
            const monthlySpent = integer(monthlyUsage["spentMinor"]);
            const monthlyBudget = integer(wallet["monthlyBudgetMinor"]);
            const monthlyRemaining = monthlyBudget > 0
              ? Math.max(0, monthlyBudget - monthlySpent)
              : Number.MAX_SAFE_INTEGER;
            const affordableSeconds = maxAffordableSeconds(
              previousBilledSeconds, billableSeconds, rate,
              Math.min(balance, dailyRemaining, monthlyRemaining),
            );
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
            if (charge.chargeMinor > 0) {
              const nextMonthlySpent = safeAddMinor(monthlySpent, charge.chargeMinor);
              writes.push({
                update: {
                  name: fs.docName(monthlyUsagePath),
                  fields: encodeFields({ uid: user.uid, month: budgetMonth, spentMinor: nextMonthlySpent, currency, updatedAt: nowIso }),
                },
                updateMask: { fieldPaths: ["uid", "month", "spentMinor", "currency", "updatedAt"] },
                ...(monthlyUsage ? {} : { currentDocument: { exists: false } }),
              });
              if (monthlyBudget > 0 && monthlySpent < monthlyBudget && nextMonthlySpent >= monthlyBudget && !monthlyBudgetAlert) {
                const notificationId = crypto.randomUUID();
                writes.push(
                  {
                    update: {
                      name: fs.docName(monthlyBudgetAlertPath),
                      fields: encodeFields({ uid: user.uid, month: budgetMonth, crossedAt: nowIso, budgetMinor: monthlyBudget, currency }),
                    },
                    currentDocument: { exists: false },
                  },
                  {
                    update: {
                      name: fs.docName("users/" + user.uid + "/notifications/" + notificationId),
                      fields: encodeFields({
                        title: "Monthly viewing budget reached",
                        body: "Your viewing charges have reached the monthly budget you set. You can review your wallet controls at any time.",
                        category: "wallet_budget", read: false, createdAt: nowIso,
                      }),
                    },
                    currentDocument: { exists: false },
                  },
                );
              }
              const lowBalanceThreshold = integer(wallet["lowBalanceAlertMinor"]);
              if (lowBalanceThreshold > 0 && balance > lowBalanceThreshold && newBalance <= lowBalanceThreshold && !lowBalanceAlert) {
                const notificationId = crypto.randomUUID();
                writes.push(
                  {
                    update: {
                      name: fs.docName(lowBalanceAlertPath),
                      fields: encodeFields({ uid: user.uid, month: budgetMonth, crossedAt: nowIso, thresholdMinor: lowBalanceThreshold, currency }),
                    },
                    currentDocument: { exists: false },
                  },
                  {
                    update: {
                      name: fs.docName("users/" + user.uid + "/notifications/" + notificationId),
                      fields: encodeFields({
                        title: "Wallet balance is low",
                        body: "Your wallet balance has reached the low-balance alert level you selected.",
                        category: "wallet_low_balance", read: false, createdAt: nowIso,
                      }),
                    },
                    currentDocument: { exists: false },
                  },
                );
              }
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
          await recordExpectedStorageEgressProgress(fs, sessionId, clientSequence, expectedEgressBytes).catch(async () => {
            const alertId = crypto.randomUUID().replace(/-/g, "");
            await fs.setDoc("storageAlerts/" + alertId, {
              severity: "warning", reasonCode: "STORAGE_EGRESS_PROGRESS_DELAYED",
              message: "A playback delivery estimate could not be updated. The session remains active while the account is checked.",
              createdAt: nowIso, expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
              acknowledged: false,
            }).catch(() => undefined);
          });
          if (response["active"] === false) {
            await releaseExpectedStorageEgress(fs, sessionId).catch(() => undefined);
          }
          const leaseTokenNext = response["active"] === true
            ? await signSessionLeaseToken({
                sid: sessionId,
                seq: clientSequence,
                positionMs: playbackPositionMs,
                billedSeconds: integer(response["billedSeconds"]),
                leaseExp: Math.floor(Date.now() / 1000) + 45,
              })
            : null;
          return Response.json({ ...response, ...(leaseTokenNext ? { leaseToken: leaseTokenNext } : {}) });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
