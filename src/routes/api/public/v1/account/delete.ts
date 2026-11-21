import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { requireVerifiedViewer } from "@/lib/server/access";

function requireRecentAuthentication(authTime: number): void {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(authTime) ||
    authTime <= 0 ||
    nowSeconds - authTime > 300 ||
    authTime > nowSeconds + 30
  ) {
    throw new ApiError(
      401,
      "RECENT_SIGN_IN_REQUIRED",
      "Please sign in again before deleting your account.",
    );
  }
}

export const Route = createFileRoute("/api/public/v1/account/delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { user } = await requireVerifiedViewer(request);
          requireRecentAuthentication(user.authTime);

          const fs = await Firestore.create();
          const nowIso = new Date().toISOString();
          const uid = user.uid;

          // 1. Terminate all active sessions
          const sessions = await fs.query("sessions", {
            filters: [
              { field: "uid", op: "EQUAL", value: uid },
              { field: "active", op: "EQUAL", value: true },
            ],
            limit: 100,
          }).catch(() => []);

          for (const s of sessions) {
            const sid = s.__id || s["sessionId"] || s["id"];
            if (sid) {
              await fs.patchDoc(`sessions/${sid}`, {
                active: false,
                status: "terminated",
                endedAt: nowIso,
                endReason: "ACCOUNT_DELETED",
              }).catch(() => null);
            }
          }

          // 2. Anonymise user profile
          const userDoc = await fs.getDoc(`users/${uid}`);
          if (userDoc) {
            await fs.setDoc(`users/${uid}`, {
              deleted: true,
              deletedAt: nowIso,
              displayName: "Deleted User",
              email: `deleted_${uid.slice(0, 8)}@deleted.bqsqwad.tv`,
              roles: [],
              sessionsRevokedAt: nowIso,
              anonymised: true,
            });
          }

          // 3. Clear sensitive device records
          await fs.deleteDoc(`devices/${uid}`).catch(() => null);

          // 4. Close wallet safely
          const walletDoc = await fs.getDoc(`wallets/${uid}`);
          if (walletDoc) {
            await fs.patchDoc(`wallets/${uid}`, {
              status: "CLOSED",
              balanceMinor: 0,
              closedAt: nowIso,
            }).catch(() => null);
          }

          // 5. Record compliance audit record
          const auditId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await fs.setDoc(`auditEvents/${auditId}`, {
            action: "ACCOUNT_DELETED_ANONYMISED",
            actorId: uid,
            targetId: uid,
            details: {
              completedAt: nowIso,
              complianceRetention: "Statutory transaction records retained with anonymised identity",
            },
            createdAt: nowIso,
          });

          return Response.json({
            ok: true,
            message: "Your account and personal data have been deleted and anonymised.",
            deletedAt: nowIso,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
