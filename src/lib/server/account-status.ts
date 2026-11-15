import { ApiError } from "./firebase-admin";

export type AccountStatus = "ACTIVE" | "SUSPENDED" | "DELETION_PENDING" | "DELETED";

/**
 * Legacy profiles without an accountStatus remain active. Explicit restricted
 * states are enforced centrally before protected API handlers run.
 */
export function assertAccountActive(profile: Record<string, unknown> | null): void {
  const status = profile?.["accountStatus"];
  if (status === "SUSPENDED") {
    throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account is temporarily suspended. Contact BQ SQWAD TV support.");
  }
  if (status === "DELETION_PENDING") {
    throw new ApiError(403, "ACCOUNT_DELETION_PENDING", "This account is pending deletion and cannot access the platform.");
  }
  if (status === "DELETED") {
    throw new ApiError(403, "ACCOUNT_DELETED", "This account is no longer active.");
  }
}
