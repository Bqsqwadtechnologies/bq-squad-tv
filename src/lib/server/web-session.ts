import { firebaseApiKey } from "../firebase-config";
import { verifyFirebaseIdToken } from "./firebase-auth";
import { ApiError, Firestore, encodeFields, getFirebaseProjectId, type FirestoreWrite } from "./firebase-admin";

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
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function webRefreshCookie(refreshToken: string): string {
  return `${WEB_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearWebRefreshCookie(): string {
  return `${WEB_REFRESH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}


const WEB_SESSION_TTL_MS = COOKIE_MAX_AGE_SECONDS * 1000;

async function refreshTokenPath(refreshToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(refreshToken));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return "webRefreshSessions/" + hash;
}

export async function assertWebRefreshSessionActive(
  fs: Firestore,
  refreshToken: string,
): Promise<void> {
  const session = await fs.getDoc(await refreshTokenPath(refreshToken));
  // Missing records are accepted only to migrate cookies issued before this
  // server-side session registry was introduced.
  if (session && (session["revoked"] === true ||
      typeof session["expiresAt"] !== "number" || session["expiresAt"] <= Date.now())) {
    throw new ApiError(401, "WEB_SESSION_REVOKED", "Your website session has expired. Sign in again.");
  }
}

export async function rotateWebRefreshSession(
  fs: Firestore,
  previousRefreshToken: string,
  nextRefreshToken: string,
  uid: string,
): Promise<void> {
  const previousPath = await refreshTokenPath(previousRefreshToken);
  const nextPath = await refreshTokenPath(nextRefreshToken);
  const now = Date.now();
  if (previousPath === nextPath) {
    await fs.transact([previousPath], ([current]) => {
      if (current?.["revoked"] === true ||
          (current && (typeof current["expiresAt"] !== "number" || current["expiresAt"] <= now))) {
        throw new ApiError(401, "WEB_SESSION_REVOKED", "Your website session has expired. Sign in again.");
      }
      return {
        result: undefined,
        writes: [{
          update: { name: fs.docName(previousPath), fields: encodeFields({
            uid, revoked: false, expiresAt: now + WEB_SESSION_TTL_MS,
          }) },
          updateMask: { fieldPaths: ["uid", "revoked", "expiresAt"] },
        }],
      };
    });
    return;
  }
  await fs.transact([previousPath, nextPath], ([previous, next]) => {
    if (previous?.["revoked"] === true ||
        (previous && (typeof previous["expiresAt"] !== "number" || previous["expiresAt"] <= now))) {
      throw new ApiError(401, "WEB_SESSION_REVOKED", "Your website session has expired. Sign in again.");
    }
    if (previous && previous["uid"] !== uid) {
      throw new ApiError(401, "WEB_SESSION_MISMATCH", "Your website session does not match this account.");
    }
    if (next) throw new ApiError(409, "WEB_SESSION_ROTATION_CONFLICT", "The website session could not be rotated.");
    const writes: FirestoreWrite[] = [];
    if (previous) {
      writes.push({
        update: { name: fs.docName(previousPath), fields: encodeFields({
          revoked: true, rotatedAt: new Date(now).toISOString(),
        }) },
        updateMask: { fieldPaths: ["revoked", "rotatedAt"] },
      });
    } else {
      // Tombstone legacy tokens on first use so they cannot be replayed after
      // the new cookie has been issued.
      writes.push({
        update: { name: fs.docName(previousPath), fields: encodeFields({
          uid, revoked: true, createdAt: new Date(now).toISOString(), revokedAt: new Date(now).toISOString(),
          expiresAt: now + WEB_SESSION_TTL_MS,
        }) },
        currentDocument: { exists: false },
      });
    }
    writes.push({
      update: { name: fs.docName(nextPath), fields: encodeFields({
        uid, revoked: false, createdAt: new Date(now).toISOString(), expiresAt: now + WEB_SESSION_TTL_MS,
      }) },
      currentDocument: { exists: false },
    });
    return { result: undefined, writes };
  });
}

export async function revokeWebRefreshSession(fs: Firestore, refreshToken: string): Promise<void> {
  const path = await refreshTokenPath(refreshToken);
  await fs.transact([path], ([current]) => {
    if (!current || current["revoked"] === true) return { result: undefined, writes: [] };
    return {
      result: undefined,
      writes: [{
        update: { name: fs.docName(path), fields: encodeFields({
          revoked: true, revokedAt: new Date().toISOString(),
        }) },
        updateMask: { fieldPaths: ["revoked", "revokedAt"] },
      }],
    };
  });
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if (!origin || origin !== requestOrigin) {
    throw new ApiError(403, "CSRF_BLOCKED", "This session request must come from the BQ SQWAD TV website.");
  }
}
