// Shared request-handling helpers for the BQ SQWAD TV API routes:
// bearer authentication, input validation, consistent error responses,
// server-side age calculation, and wallet document access.

import { z } from "zod";
import { ApiError, Firestore, getFirebaseProjectId } from "./firebase-admin";
import { verifyFirebaseIdToken, type VerifiedUser } from "./firebase-auth";

export function errorBody(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: "Invalid request.", code: "INVALID_REQUEST", issues: error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }
  console.error("Unhandled API error", error);
  return Response.json({ error: "Internal server error.", code: "INTERNAL" }, { status: 500 });
}

export async function requireUser(request: Request): Promise<VerifiedUser> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "UNAUTHENTICATED", "A Firebase sign-in token is required.");
  }
  return verifyFirebaseIdToken(authorization.slice("Bearer ".length), getFirebaseProjectId());
}

export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
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
  const dob = new Date(`${dateOfBirthIso}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) throw new ApiError(400, "INVALID_REQUEST", "dateOfBirth must be a YYYY-MM-DD date.");
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

export type UserProfile = {
  profileComplete: boolean;
  adultEligible: boolean;
  roleTags: string[];
};

export async function getUserProfile(fs: Firestore, uid: string): Promise<UserProfile> {
  const doc = await fs.getDoc(`users/${uid}`);
  return {
    profileComplete: doc?.["profileComplete"] === true,
    adultEligible: doc?.["adultEligible"] === true,
    roleTags: Array.isArray(doc?.["roleTags"]) ? (doc["roleTags"] as string[]) : [],
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
};

export async function getWallet(fs: Firestore, uid: string): Promise<WalletState> {
  const doc = await fs.getDoc(`wallets/${uid}`);
  const today = new Date().toISOString().slice(0, 10);
  const spentDate = typeof doc?.["spentDate"] === "string" ? (doc["spentDate"] as string) : null;
  return {
    balanceMinor: typeof doc?.["balanceMinor"] === "number" ? (doc["balanceMinor"] as number) : 0,
    currency: typeof doc?.["currency"] === "string" ? (doc["currency"] as string) : "NGN",
    dailySpendLimitMinor: typeof doc?.["dailySpendLimitMinor"] === "number" ? (doc["dailySpendLimitMinor"] as number) : null,
    spentTodayMinor: spentDate === today && typeof doc?.["spentTodayMinor"] === "number" ? (doc["spentTodayMinor"] as number) : 0,
    spentDate,
  };
}
