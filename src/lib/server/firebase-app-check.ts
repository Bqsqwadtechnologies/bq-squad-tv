import { ApiError, getAdminAccessToken, getFirebaseProjectId } from "./firebase-admin";

const verifiedAppCheckTokens = new Map<string, number>();

function tokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const claims = JSON.parse(decoded) as { exp?: unknown };
    return typeof claims.exp === "number" && Number.isSafeInteger(claims.exp)
      ? claims.exp * 1000
      : null;
  } catch {
    return null;
  }
}

export async function verifyFirebaseAppCheckToken(token: string): Promise<void> {
  if (!token || token.length > 8192) {
    throw new ApiError(401, "APP_CHECK_INVALID", "A valid Firebase App Check token is required.");
  }
  const now = Date.now();
  const cachedExpiry = verifiedAppCheckTokens.get(token);
  if (cachedExpiry && cachedExpiry > now) return;

  const accessToken = await getAdminAccessToken("https://www.googleapis.com/auth/firebase");
  const projectId = getFirebaseProjectId();
  let response: Response;
  try {
    response = await fetch(
      `https://firebaseappcheck.googleapis.com/v1beta/projects/${projectId}:verifyAppCheckToken`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ appCheckToken: token }),
      },
    );
  } catch {
    throw new ApiError(503, "APP_CHECK_UNAVAILABLE", "Firebase App Check verification is temporarily unavailable.");
  }
  if (!response.ok) {
    throw new ApiError(401, "APP_CHECK_INVALID", "The Firebase App Check token could not be verified.");
  }
  const expiry = tokenExpiryMs(token);
  if (expiry && expiry > now + 30_000) {
    if (verifiedAppCheckTokens.size > 5000) {
      for (const [cachedToken, cachedTokenExpiry] of verifiedAppCheckTokens) {
        if (cachedTokenExpiry <= now) verifiedAppCheckTokens.delete(cachedToken);
      }
    }
    verifiedAppCheckTokens.set(token, expiry - 30_000);
  }
}

export async function requireAppCheck(request: Request): Promise<void> {
  if (process.env["APP_CHECK_ENFORCED"] !== "true") return;
  const token = request.headers.get("X-Firebase-AppCheck");
  if (!token) {
    throw new ApiError(401, "APP_CHECK_REQUIRED", "This request requires Firebase App Check attestation.");
  }
  await verifyFirebaseAppCheckToken(token);
}
