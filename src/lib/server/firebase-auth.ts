// Server-side Firebase Authentication ID-token verification using Google's
// public JWKS and Web Crypto. No client-supplied identity claims are trusted.

import { ApiError, decodeBase64Url, toArrayBuffer } from "./firebase-admin";

export type VerifiedUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  customClaims: Record<string, unknown>;
};

let cachedJwks: { keys: Array<JsonWebKey & { kid?: string; alg?: string }>; fetchedAt: number } | null = null;

async function getSigningKeys(): Promise<Array<JsonWebKey & { kid?: string; alg?: string }>> {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < 30 * 60 * 1000) return cachedJwks.keys;
  const response = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  );
  if (!response.ok) throw new ApiError(502, "GOOGLE_AUTH_FAILED", "Could not load Google signing keys.");
  const keySet = (await response.json()) as { keys?: Array<JsonWebKey & { kid?: string; alg?: string }> };
  cachedJwks = { keys: keySet.keys ?? [], fetchedAt: Date.now() };
  return cachedJwks.keys;
}

function decodeJwtPart(part: string): Record<string, unknown> {
  const value = JSON.parse(new TextDecoder().decode(decodeBase64Url(part))) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(401, "UNAUTHENTICATED", "Invalid authentication token.");
  }
  return value as Record<string, unknown>;
}

export async function verifyFirebaseIdToken(token: string, projectId: string): Promise<VerifiedUser> {
  if (!token || token.length > 8192) throw new ApiError(401, "UNAUTHENTICATED", "Invalid authentication token.");
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new ApiError(401, "UNAUTHENTICATED", "Invalid authentication token.");
  }
  const [encodedHeader, encodedClaims, encodedSignature] = parts as [string, string, string];
  const header = decodeJwtPart(encodedHeader);
  const claims = decodeJwtPart(encodedClaims);
  if (header["alg"] !== "RS256" || typeof header["kid"] !== "string") {
    throw new ApiError(401, "UNAUTHENTICATED", "Invalid authentication token.");
  }

  const signingKey = (await getSigningKeys()).find((key) => key.kid === header["kid"] && key.alg === "RS256");
  if (!signingKey) throw new ApiError(401, "UNAUTHENTICATED", "Invalid authentication token.");

  const key = await crypto.subtle.importKey(
    "jwk",
    signingKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    toArrayBuffer(decodeBase64Url(encodedSignature)),
    toArrayBuffer(new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`)),
  );

  const now = Math.floor(Date.now() / 1000);
  const uid = typeof claims["sub"] === "string" ? claims["sub"] : "";
  if (
    !validSignature ||
    claims["iss"] !== `https://securetoken.google.com/${projectId}` ||
    claims["aud"] !== projectId ||
    uid.length === 0 ||
    typeof claims["exp"] !== "number" ||
    claims["exp"] <= now ||
    typeof claims["iat"] !== "number" ||
    claims["iat"] > now + 300
  ) {
    throw new ApiError(401, "UNAUTHENTICATED", "Authentication token is expired or invalid.");
  }
  return {
    uid,
    email: typeof claims["email"] === "string" ? claims["email"] : null,
    emailVerified: claims["email_verified"] === true,
    customClaims: {
      admin: claims["admin"] === true,
      producer: claims["producer"] === true,
      roleTags: Array.isArray(claims["roleTags"]) ? claims["roleTags"].filter((role): role is string => typeof role === "string") : [],
      adminModules: Array.isArray(claims["adminModules"]) ? claims["adminModules"].filter((module): module is string => typeof module === "string") : [],
    },
  };
}
