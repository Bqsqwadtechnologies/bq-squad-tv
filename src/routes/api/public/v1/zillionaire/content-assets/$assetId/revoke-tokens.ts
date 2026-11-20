import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";

export const Route = createFileRoute(
  "/api/public/v1/zillionaire/content-assets/$assetId/revoke-tokens",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireAdminModule(fs, user, "content");

          const assetId = params.assetId;
          if (!assetId || !/^[A-Za-z0-9_-]{1,128}$/.test(assetId)) {
            throw new ApiError(400, "INVALID_ASSET_ID", "Asset ID is invalid.");
          }

          const nowIso = new Date().toISOString();

          // 1. Mark asset playback tokens as revoked by bumping tokenVersion
          const assetRef = `contentAssets/${assetId}`;
          const assetDoc = await fs.getDoc(assetRef);
          const currentVersion = Number(assetDoc?.["playbackTokenVersion"] || 1);
          await fs.patchDoc(assetRef, {
            playbackTokenVersion: currentVersion + 1,
            tokensRevokedAt: nowIso,
            tokensRevokedBy: user.uid,
          });

          // 2. Query and terminate any active sessions for this asset
          const activeSessions = await fs.query("sessions", {
            filters: [
              { field: "assetId", op: "EQUAL", value: assetId },
              { field: "active", op: "EQUAL", value: true },
            ],
            limit: 200,
          }).catch(() => []);

          let revokedCount = 0;
          for (const s of activeSessions) {
            const sid = s.__id || s["sessionId"] || s["id"];
            if (sid) {
              await fs.patchDoc(`sessions/${sid}`, {
                active: false,
                status: "revoked",
                endedAt: nowIso,
                endReason: "TITLE_TOKENS_REVOKED_BY_OWNER",
              }).catch(() => null);
              revokedCount++;
            }
          }

          // 3. Log audit event
          const auditId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await fs.setDoc(`auditEvents/${auditId}`, {
            action: "CONTENT_PLAYBACK_TOKENS_REVOKED",
            actorId: user.uid,
            targetId: assetId,
            details: {
              assetId,
              previousVersion: currentVersion,
              newVersion: currentVersion + 1,
              terminatedSessionsCount: revokedCount,
            },
            createdAt: nowIso,
          });

          return Response.json({
            ok: true,
            assetId,
            revokedAt: nowIso,
            newTokenVersion: currentVersion + 1,
            terminatedSessionsCount: revokedCount,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
