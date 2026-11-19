import { createFileRoute } from "@tanstack/react-router";
import { Firestore, FirestoreWrite, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { releaseSessionLease } from "@/lib/server/session-limits";
import { settleSessionHold } from "@/lib/server/session-holds";
import { releaseExpectedStorageEgress } from "@/lib/server/storage/expected-egress";
import { requireSessionOwned, toSessionSnapshot } from "../-shared";

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
          const fs = await Firestore.create();
          const nowIso = new Date().toISOString();

          const sessionPath = "sessions/" + sessionId;
          const walletPath = "wallets/" + user.uid;
          const holdPath = "walletHolds/" + sessionId;
          const activeSessionsPath = "activeSessions/" + user.uid;
          const readPaths = [sessionPath, walletPath, activeSessionsPath, holdPath];

          const snapshot = await fs.transact(readPaths, (docs) => {
            const session = requireSessionOwned(docs[0] ?? null, sessionId, user.uid);
            const wallet = docs[1] ?? {};
            const activeSessionDoc = docs[2] ?? {};
            const walletHold = docs[3] ?? {};

            const balance = integer(wallet["balanceMinor"]);
            const heldBalance = integer(wallet["heldBalanceMinor"]);
            const ownHold =
              walletHold["uid"] === user.uid && walletHold["sessionId"] === sessionId
                ? integer(walletHold["amountMinor"])
                : 0;

            if (session["active"] !== true) {
              return { result: toSessionSnapshot(sessionId, session, balance, null), writes: [] };
            }

            const currentAcceptedSeconds = integer(session["acceptedSeconds"]);
            const releasedHold = settleSessionHold({
              balanceMinor: balance,
              heldBalanceMinor: heldBalance,
              ownHoldMinor: ownHold,
              chargeMinor: 0,
              targetHoldMinor: 0,
              keepActive: false,
            });

            const activeLeases = releaseSessionLease(
              activeSessionDoc["sessions"],
              sessionId,
              Date.now(),
            );

            const writes: FirestoreWrite[] = [
              {
                update: {
                  name: fs.docName(walletPath),
                  fields: encodeFields({
                    heldBalanceMinor: releasedHold.heldBalanceMinor,
                    updatedAt: nowIso,
                  }),
                },
                updateMask: { fieldPaths: ["heldBalanceMinor", "updatedAt"] },
              },
              {
                update: {
                  name: fs.docName(sessionPath),
                  fields: encodeFields({
                    active: false,
                    state: "recovered",
                    endedAt: nowIso,
                    billedSeconds: currentAcceptedSeconds,
                    walletHoldMinor: 0,
                    updatedAt: nowIso,
                  }),
                },
                updateMask: {
                  fieldPaths: [
                    "active",
                    "state",
                    "endedAt",
                    "billedSeconds",
                    "walletHoldMinor",
                    "updatedAt",
                  ],
                },
              },
              {
                update: {
                  name: fs.docName(holdPath),
                  fields: encodeFields({
                    amountMinor: 0,
                    status: "released",
                    expiresAt: null,
                    updatedAt: nowIso,
                  }),
                },
                updateMask: { fieldPaths: ["amountMinor", "status", "expiresAt", "updatedAt"] },
              },
              {
                update: {
                  name: fs.docName(activeSessionsPath),
                  fields: encodeFields({ sessions: activeLeases, updatedAt: nowIso }),
                },
                updateMask: { fieldPaths: ["sessions", "updatedAt"] },
              },
            ];

            return {
              result: toSessionSnapshot(sessionId, session, balance, null),
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
