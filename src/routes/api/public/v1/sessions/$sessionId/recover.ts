import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore, encodeFields, type FirestoreWrite } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { releaseSessionLease } from "@/lib/server/session-limits";
import { settleSessionHold } from "@/lib/server/session-holds";
import { releaseExpectedStorageEgress } from "@/lib/server/storage/expected-egress";
import {
  incrementalSessionCharge,
  requireSessionOwned,
  toSessionSnapshot,
} from "../-shared";

function integer(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
}

export const Route = createFileRoute("/api/public/v1/sessions/$sessionId/recover")({
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
          const nowIso = new Date().toISOString();
          const sessionPath = "sessions/" + sessionId;
          const walletPath = "wallets/" + user.uid;
          const holdPath = "walletHolds/" + sessionId;
          const initialSession = requireSessionOwned(await fs.getDoc(sessionPath), sessionId, user.uid);
          const activeSessionsPath = "activeSessions/" + user.uid;
          const readPaths = [sessionPath, walletPath, activeSessionsPath, holdPath];

          const snapshot = await fs.transact(readPaths, (docs) => {
            const session = requireSessionOwned(docs[0] ?? null, sessionId, user.uid);
            const wallet = docs[1] ?? {};
            const activeSessionDoc = docs[2] ?? {};
            const walletHold = docs[3] ?? {};
            const balance = integer(wallet["balanceMinor"]);
            const heldBalance = integer(wallet["heldBalanceMinor"]);
            const ownHold = walletHold["uid"] === user.uid && walletHold["sessionId"] === sessionId
              ? integer(walletHold["amountMinor"]) : 0;

            if (session["active"] !== true) {
              return { result: toSessionSnapshot(sessionId, session, balance, null), writes: [] };
            }

            const currentAcceptedSeconds = integer(session["acceptedSeconds"]);
            const billedSeconds = integer(session["billedSeconds"]);
            const unbilledSeconds = Math.max(0, currentAcceptedSeconds - billedSeconds);
            const rate = integer(session["pricePerMinuteMinor"]);
            const finalDebit = incrementalSessionCharge(rate, billedSeconds, currentAcceptedSeconds);

            const holdSettlement = settleSessionHold({
              balanceMinor: balance,
              heldBalanceMinor: heldBalance,
              ownHoldMinor: ownHold,
              chargeMinor: finalDebit,
              targetHoldMinor: 0,
              keepActive: false,
            });

            const writes: FirestoreWrite[] = [
              {
                update: {
                  name: fs.docName(walletPath),
                  fields: encodeFields({
                    balanceMinor: holdSettlement.balanceMinor,
                    heldBalanceMinor: holdSettlement.heldBalanceMinor,
                    updatedAt: nowIso,
                  }),
                },
              },
              {
                delete: fs.docName(holdPath),
              },
              {
                update: {
                  name: fs.docName(sessionPath),
                  fields: encodeFields({
                    active: false,
                    state: "recovered",
                    endedAt: nowIso,
                    billedSeconds: currentAcceptedSeconds,
                    totalChargedMinor: integer(session["totalChargedMinor"]) + finalDebit,
                    updatedAt: nowIso,
                  }),
                },
              },
            ];

            const activeLeases = releaseSessionLease(
              Array.isArray(activeSessionDoc["sessions"]) ? (activeSessionDoc["sessions"] as string[]) : [],
              sessionId
            );
            writes.push({
              set: {
                name: fs.docName(activeSessionsPath),
                fields: encodeFields({ sessions: activeLeases, updatedAt: nowIso }),
              },
            });

            return {
              result: toSessionSnapshot(sessionId, session, holdSettlement.balanceMinor, null),
              writes,
            };
          });

          await releaseExpectedStorageEgress(fs, sessionId);
          return Response.json({
            recovered: true,
            sessionId,
            snapshot,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
