import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { requireViewer } from "@/lib/server/access";
import {
  extractUnlockToken,
  clearRevokedOwnerSessions,
  revokeOwnerSession,
} from "@/lib/server/zillionaire-access";
import { writeAuditLog } from "@/lib/server/audit";

export const Route = createFileRoute("/api/public/v1/zillionaire/access/sessions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user, fs, access } = await requireViewer(request);
          if (!access.isZillionaireOwner)
            throw new ApiError(403, "OWNER_REQUIRED", "Owner access required.");
          const rows = await fs.query(`zillionaireOwnerSessions`, {
            filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
            limit: 50,
          });
          const sessions = rows
            .filter((row) => row["revoked"] !== true)
            .map((row) => ({
              id: row["sessionId"],
              browser: row["browser"] || "Unknown browser",
              lastSeenAt: row["lastSeenAt"] || row["createdAt"],
              createdAt: row["createdAt"],
              current: row["sessionId"] === readSessionId(extractUnlockToken(request)),
              country: "Unavailable",
            }));
          return Response.json({ sessions });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const { user, fs, access } = await requireViewer(request);
          if (!access.isZillionaireOwner)
            throw new ApiError(403, "OWNER_REQUIRED", "Owner access required.");
          const rows = await fs.query(`zillionaireOwnerSessions`, {
            filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
            limit: 50,
          });
          const now = new Date().toISOString();
          clearRevokedOwnerSessions();
          for (const row of rows) {
            const id = String(row["__id"] || "");
            if (id) {
              await fs.patchDoc(`zillionaireOwnerSessions/${id}`, {
                revoked: true,
                revokedAt: now,
              });
            }
            if (typeof row["sessionId"] === "string") revokeOwnerSession(row["sessionId"]);
          }
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "owner.sessions.revoked_all",
            targetType: "owner_security",
            targetId: user.uid,
            reason: "User signed out all owner sessions",
            metadata: { count: rows.length },
          });
          const isProd = process.env["NODE_ENV"] === "production";
          const cookie = `zillionaire_unlock=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isProd ? "; Secure" : ""}`;
          return new Response(JSON.stringify({ ok: true, revoked: rows.length }), {
            status: 200,
            headers: { "content-type": "application/json", "set-cookie": cookie },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});

function readSessionId(token: string | null): string | null {
  if (!token) return null;
  try {
    const encoded = token.split(".")[0];
    if (!encoded) return null;
    return (
      (JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { sessionId?: string })
        .sessionId || null
    );
  } catch {
    return null;
  }
}
