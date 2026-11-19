import { ApiError } from "./firebase-admin";

/** Rejects Firebase ID tokens created before the account's global session revocation time. */
export function assertAuthenticationSessionActive(
  profile: Record<string, unknown> | null,
  authTimeSeconds: number,
): void {
  const revokedAfter = profile?.["sessionsRevokedAfter"];
  if (
    typeof revokedAfter === "number" &&
    Number.isFinite(revokedAfter) &&
    authTimeSeconds <= revokedAfter
  ) {
    throw new ApiError(
      401,
      "AUTH_SESSION_REVOKED",
      "Your sign-in session has been revoked. Sign in again.",
    );
  }
}
