// Shared request-handling helpers for the BQ SQWAD TV API routes:
// bearer authentication, input validation, consistent error responses,
// server-side age calculation, and wallet document access.

import { z } from "zod";
import { ApiError, Firestore, getFirebaseProjectId } from "./firebase-admin";
import { requireAppCheck } from "./firebase-app-check";
import { verifyFirebaseIdToken, type VerifiedUser } from "./firebase-auth";
import { assertAccountActive } from "./account-status";
import { assertAuthenticationSessionActive } from "./auth-session-revocation";
import { currencyForCountry } from "./currency";
import { generateErrorRef, getFriendlyErrorMessage } from "./friendly-errors";

export function errorBody(error: unknown): Response {
  const ref = generateErrorRef();
  if (error instanceof ApiError) {
    const message = getFriendlyErrorMessage(error.code, error.message);
    return Response.json(
      { code: error.code, message, error: message, ref },
      { status: error.status },
    );
  }
  if (error instanceof z.ZodError) {
    const message = getFriendlyErrorMessage("INVALID_REQUEST", "Invalid request.");
    return Response.json(
      {
        code: "INVALID_REQUEST",
        message,
        error: message,
        ref,
        issues: error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }
  console.error("Unhandled API error", ref, error);
  const message = getFriendlyErrorMessage("INTERNAL", "Something went wrong on our end.");
  return Response.json({ code: "INTERNAL", message, error: message, ref }, { status: 500 });
}

export async function requireUser(request: Request): Promise<VerifiedUser> {
  await requireAppCheck(request);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "UNAUTHENTICATED", "A Firebase sign-in token is required.");
  }
  const user = await verifyFirebaseIdToken(
    authorization.slice("Bearer ".length),
    getFirebaseProjectId(),
  );
  // Read the profile for every authenticated request so account suspension,
  // deletion and app-level email verification take effect immediately.
  const fs = await Firestore.create();
  const profile = await fs.getDoc("users/" + user.uid);
  assertAccountActive(profile);
  assertAuthenticationSessionActive(profile, user.authTime);

  // Brevo OTP verification is accepted only while bound to the exact current
  // Firebase email. Firebase token signature and UID remain authoritative.
  const storedEmail =
    typeof profile?.["email"] === "string" ? (profile["email"] as string).trim().toLowerCase() : "";
  const verifiedEmail = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (
    !user.emailVerified &&
    user.email &&
    profile?.["appEmailVerified"] === true &&
    storedEmail === verifiedEmail
  ) {
    return { ...user, emailVerified: true };
  }
  return user;
}

export async function parseBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_REQUEST", "Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

/** Age in whole years, always computed on the server from the stored date of birth. */
export function ageInYears(dateOfBirthIso: string, now: Date = new Date()): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirthIso)) {
    throw new ApiError(400, "INVALID_REQUEST", "dateOfBirth must be a valid YYYY-MM-DD date.");
  }
  const dob = new Date(`${dateOfBirthIso}T00:00:00Z`);
  if (
    Number.isNaN(dob.getTime()) ||
    dob.toISOString().slice(0, 10) !== dateOfBirthIso ||
    dob.getTime() > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ) {
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "dateOfBirth must be a real date that is not in the future.",
    );
  }
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;

  if (age > 120) {
    throw new ApiError(
      400,
      "DATE_OF_BIRTH_INVALID",
      "dateOfBirth must be a valid date within the last 120 years.",
    );
  }
  return age;
}

export function validateAccountAge(dateOfBirthIso: string, now: Date = new Date()): number {
  const age = ageInYears(dateOfBirthIso, now);
  if (age < 13) {
    throw new ApiError(
      400,
      "AGE_BELOW_MINIMUM",
      "You must be at least 13 years old to hold an account.",
    );
  }
  return age;
}

export type UserProfile = {
  profileComplete: boolean;
  adultEligible: boolean;
  isUnder18: boolean;
  kidsSafeMode: boolean;
  roleTags: string[];
  countryCode: string;
};

export async function getUserProfile(fs: Firestore, uid: string): Promise<UserProfile> {
  const doc = await fs.getDoc(`users/${uid}`);
  let dateOfBirthVerifiedAdult = false;
  let isUnder18 = false;
  if (typeof doc?.["dateOfBirth"] === "string") {
    try {
      const computedAge = ageInYears(doc["dateOfBirth"] as string);
      dateOfBirthVerifiedAdult = computedAge >= 18;
      isUnder18 = computedAge < 18;
    } catch {
      // Corrupt or legacy profile dates must never grant adult access.
      dateOfBirthVerifiedAdult = false;
      isUnder18 = true;
    }
  }
  const adultEligible =
    doc?.["adultEligible"] === true &&
    doc?.["adultAgeVerified"] === true &&
    doc?.["adultIdentityVerified"] === true &&
    dateOfBirthVerifiedAdult;
  const kidsSafeMode = isUnder18 || doc?.["kidsSafeMode"] === true || doc?.["isKids"] === true;

  return {
    profileComplete: doc?.["profileComplete"] === true,
    adultEligible: isUnder18 ? false : adultEligible,
    isUnder18,
    kidsSafeMode,
    roleTags: Array.isArray(doc?.["roleTags"]) ? (doc["roleTags"] as string[]) : [],
    countryCode:
      typeof doc?.["countryCode"] === "string"
        ? (doc["countryCode"] as string).trim().toUpperCase()
        : "",
  };
}

export function requireAdultForContent(profile: UserProfile, adultOnly: unknown): void {
  if (adultOnly === true && !profile.adultEligible) {
    throw new ApiError(403, "AGE_RESTRICTED", "This content is restricted to adult viewers.");
  }
}

export type WalletState = {
  balanceMinor: number;
  currency: string;
  dailySpendLimitMinor: number | null;
  spentTodayMinor: number;
  spentDate: string | null;
  monthlyBudgetMinor?: number | null;
  lowBalanceAlertMinor?: number | null;
  pendingDailySpendLimitMinor?: number | null;
  pendingDailySpendLimitEffectiveAt?: string | null;
};

export async function getWallet(fs: Firestore, uid: string): Promise<WalletState> {
  const doc = await fs.getDoc(`wallets/${uid}`);
  const profile = doc ? null : await fs.getDoc(`users/${uid}`);
  const today = new Date().toISOString().slice(0, 10);
  const spentDate = typeof doc?.["spentDate"] === "string" ? (doc["spentDate"] as string) : null;
  return {
    balanceMinor: typeof doc?.["balanceMinor"] === "number" ? (doc["balanceMinor"] as number) : 0,
    currency:
      typeof doc?.["currency"] === "string"
        ? (doc["currency"] as string)
        : doc
          ? "NGN"
          : currencyForCountry(profile?.["countryCode"]),
    dailySpendLimitMinor:
      typeof doc?.["dailySpendLimitMinor"] === "number"
        ? (doc["dailySpendLimitMinor"] as number)
        : null,
    spentTodayMinor:
      spentDate === today && typeof doc?.["spentTodayMinor"] === "number"
        ? (doc["spentTodayMinor"] as number)
        : 0,
    spentDate,
    monthlyBudgetMinor:
      typeof doc?.["monthlyBudgetMinor"] === "number"
        ? (doc["monthlyBudgetMinor"] as number)
        : null,
    lowBalanceAlertMinor:
      typeof doc?.["lowBalanceAlertMinor"] === "number"
        ? (doc["lowBalanceAlertMinor"] as number)
        : null,
    pendingDailySpendLimitMinor:
      typeof doc?.["pendingDailySpendLimitMinor"] === "number"
        ? (doc["pendingDailySpendLimitMinor"] as number)
        : null,
    pendingDailySpendLimitEffectiveAt:
      typeof doc?.["pendingDailySpendLimitEffectiveAt"] === "string"
        ? (doc["pendingDailySpendLimitEffectiveAt"] as string)
        : null,
  };
}
