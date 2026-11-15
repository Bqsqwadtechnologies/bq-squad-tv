import { ApiError, getAdminAccessToken, getFirebaseProjectId } from "./firebase-admin";

export async function verifyFirebaseAppCheckToken(token: string): Promise<void> {
  if (!token || token.length > 8192) {
    throw new ApiError(401, "APP_CHECK_INVALID", "A valid Firebase App Check token is required.");
  }
  const accessToken = await getAdminAccessToken("https://www.googleapis.com/auth/firebase");
  const projectId = getFirebaseProjectId();
  let response: Response;
  try {
    response = await fetch(
      `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}:verifyAppCheckToken`,
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
}

export async function requireAppCheck(request: Request): Promise<void> {
  if (process.env["APP_CHECK_ENFORCED"] !== "true") return;
  const token = request.headers.get("X-Firebase-AppCheck");
  if (!token) {
    throw new ApiError(401, "APP_CHECK_REQUIRED", "This request requires Firebase App Check attestation.");
  }
  await verifyFirebaseAppCheckToken(token);
}
