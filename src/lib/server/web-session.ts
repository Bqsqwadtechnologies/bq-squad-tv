import { ApiError } from "./firebase-admin";
import { firebaseApiKey } from "../firebase-config";
import { verifyFirebaseIdToken } from "./firebase-auth";
import { getFirebaseProjectId } from "./firebase-admin";

export const WEB_REFRESH_COOKIE = "__Host-bq_sqwad_refresh";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type RefreshedFirebaseSession = {
  idToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  uid: string;
};

export async function refreshFirebaseWebSession(refreshToken: string): Promise<RefreshedFirebaseSession> {
  if (!refreshToken || refreshToken.length > 4096) {
    throw new ApiError(401, "WEB_SESSION_INVALID", "Your web session has expired. Sign in again.");
  }
  let response: Response;
  try {
    response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${firebaseApiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      },
    );
  } catch {
    throw new ApiError(502, "WEB_SESSION_REFRESH_FAILED", "Could not refresh your sign-in session.");
  }
  const result = await response.json() as {
    id_token?: string;
    refresh_token?: string;
    expires_in?: string;
    user_id?: string;
  };
  if (
    !response.ok ||
    !result.id_token ||
    !result.refresh_token ||
    !result.user_id
  ) {
    throw new ApiError(401, "WEB_SESSION_INVALID", "Your web session has expired. Sign in again.");
  }
  const verified = await verifyFirebaseIdToken(result.id_token, getFirebaseProjectId());
  if (verified.uid !== result.user_id) {
    throw new ApiError(401, "WEB_SESSION_INVALID", "Your web session could not be verified.");
  }
  const expiresInSeconds = Number(result.expires_in);
  return {
    idToken: result.id_token,
    refreshToken: result.refresh_token,
    expiresInSeconds: Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
      ? expiresInSeconds
      : 3600,
    uid: verified.uid,
  };
}

export function readWebRefreshCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    const name = item.slice(0, separator).trim();
    if (name !== WEB_REFRESH_COOKIE) continue;
    return decodeURIComponent(item.slice(separator + 1).trim());
  }
  return null;
}

export function webRefreshCookie(refreshToken: string): string {
  return `${WEB_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearWebRefreshCookie(): string {
  return `${WEB_REFRESH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if (!origin || origin !== requestOrigin) {
    throw new ApiError(403, "CSRF_BLOCKED", "This session request must come from the BQ SQWAD TV website.");
  }
}
