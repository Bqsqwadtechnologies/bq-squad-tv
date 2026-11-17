import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, getFirebaseProjectId } from "@/lib/server/firebase-admin";
import { requireAppCheck } from "@/lib/server/firebase-app-check";
import { errorBody, parseBody } from "@/lib/server/api";
import { verifyFirebaseIdToken } from "@/lib/server/firebase-auth";
import { refreshFirebaseWebSession, rotateWebRefreshSession, requireSameOrigin, webRefreshCookie } from "@/lib/server/web-session";
import { recordRiskSignal } from "@/lib/server/risk-engine";

const schema = z.object({
  idToken: z.string().min(100).max(8192),
  refreshToken: z.string().min(20).max(4096),
});

export const Route = createFileRoute("/api/public/v1/auth/web/session")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        requireSameOrigin(request);
        await requireAppCheck(request);
        const body = await parseBody(request, schema);
        const initialUser = await verifyFirebaseIdToken(body.idToken, getFirebaseProjectId());
        const session = await refreshFirebaseWebSession(body.refreshToken);
        if (session.uid !== initialUser.uid) {
          throw new ApiError(401, "WEB_SESSION_MISMATCH", "The sign-in session did not match this account.");
        }
        const fs = await Firestore.create();
        await rotateWebRefreshSession(fs, body.refreshToken, session.refreshToken, session.uid);
        await recordRiskSignal(fs, session.uid, "signin");
        return Response.json(
          { idToken: session.idToken, expiresInSeconds: session.expiresInSeconds },
          {
            headers: {
              "set-cookie": webRefreshCookie(session.refreshToken),
              "cache-control": "no-store",
              pragma: "no-cache",
            },
          },
        );
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
