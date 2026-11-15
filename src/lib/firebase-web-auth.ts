import { firebaseApiKey, firebaseProjectId } from "./firebase-config";
import { getWebAppCheckHeaders } from "./firebase-web-app-check";

type FirebaseAuthResponse = {
  idToken?: string;
  refreshToken?: string;
  expiresIn?: string;
  localId?: string;
  email?: string;
  error?: { message?: string };
};

type WebSessionResponse = {
  idToken?: string;
  expiresInSeconds?: number;
  error?: string;
};

let activeIdToken: string | null = null;
let activeIdTokenExpiresAt = 0;

async function firebaseAuthRequest(
  operation: "signInWithPassword" | "signUp",
  email: string,
  password: string,
): Promise<{ idToken: string; refreshToken: string; email: string }> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${firebaseApiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, returnSecureToken: true }),
    },
  );
  const result = await response.json() as FirebaseAuthResponse;
  if (!response.ok || !result.idToken || !result.refreshToken) {
    const message = result.error?.message;
    if (message === "OPERATION_NOT_ALLOWED") {
      throw new Error("Email and password sign-in is not enabled for this Firebase project.");
    }
    if (message === "EMAIL_EXISTS") throw new Error("An account already exists for this email.");
    if (message === "INVALID_PASSWORD" || message === "EMAIL_NOT_FOUND" || message === "INVALID_LOGIN_CREDENTIALS") {
      throw new Error("Sign-in failed. Check your email and password.");
    }
    if (message === "WEAK_PASSWORD") throw new Error("Choose a stronger password.");
    throw new Error(operation === "signUp" ? "Account creation failed." : "Sign-in failed.");
  }
  return {
    idToken: result.idToken,
    refreshToken: result.refreshToken,
    email: result.email ?? email.trim(),
  };
}

async function establishWebSession(
  idToken: string,
  refreshToken: string,
): Promise<string> {
  const response = await fetch("/api/public/v1/auth/web/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...await getWebAppCheckHeaders() },
    body: JSON.stringify({ idToken, refreshToken }),
  });
  const result = await response.json() as WebSessionResponse;
  if (!response.ok || !result.idToken) {
    throw new Error(result.error ?? "Could not establish a secure website session.");
  }
  activeIdToken = result.idToken;
  activeIdTokenExpiresAt = Date.now() + Math.max(60, result.expiresInSeconds ?? 3600) * 1000 - 60_000;
  return result.idToken;
}

export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<{ idToken: string; email: string }> {
  const auth = await firebaseAuthRequest("signInWithPassword", email, password);
  const idToken = await establishWebSession(auth.idToken, auth.refreshToken);
  return { idToken, email: auth.email };
}

export async function createAccountWithEmailPassword(
  email: string,
  password: string,
): Promise<{ idToken: string; email: string }> {
  const auth = await firebaseAuthRequest("signUp", email, password);
  const idToken = await establishWebSession(auth.idToken, auth.refreshToken);
  return { idToken, email: auth.email };
}

export async function restoreWebSession(): Promise<string | null> {
  if (activeIdToken && Date.now() < activeIdTokenExpiresAt) return activeIdToken;
  try {
    const response = await fetch("/api/public/v1/auth/web/session/refresh", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...await getWebAppCheckHeaders() },
      body: "{}",
    });
    const result = await response.json() as WebSessionResponse;
    if (!response.ok || !result.idToken) {
      activeIdToken = null;
      activeIdTokenExpiresAt = 0;
      return null;
    }
    activeIdToken = result.idToken;
    activeIdTokenExpiresAt = Date.now() + Math.max(60, result.expiresInSeconds ?? 3600) * 1000 - 60_000;
    return activeIdToken;
  } catch {
    activeIdToken = null;
    activeIdTokenExpiresAt = 0;
    return null;
  }
}

export async function getActiveWebIdToken(): Promise<string | null> {
  if (activeIdToken && Date.now() < activeIdTokenExpiresAt) return activeIdToken;
  return restoreWebSession();
}

export async function sendEmailVerificationCode(): Promise<{ sent: boolean; alreadyVerified: boolean }> {
  const idToken = await getActiveWebIdToken();
  if (!idToken) throw new Error("Sign in again to verify your email.");
  const response = await fetch("/api/public/v1/auth/email/send-code", {
    method: "POST",
    headers: { authorization: `Bearer ${idToken}`, ...await getWebAppCheckHeaders() },
  });
  const result = await response.json() as { sent?: boolean; alreadyVerified?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error ?? "Could not send the verification code.");
  return { sent: result.sent === true, alreadyVerified: result.alreadyVerified === true };
}

export async function verifyEmailCode(code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code from your email.");
  const idToken = await getActiveWebIdToken();
  if (!idToken) throw new Error("Sign in again to verify your email.");
  const response = await fetch("/api/public/v1/auth/email/verify-code", {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
      ...await getWebAppCheckHeaders(),
    },
    body: JSON.stringify({ code }),
  });
  const result = await response.json() as { verified?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error ?? "Email verification failed.");
  return result.verified === true;
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseApiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email: email.trim() }),
    },
  );
  if (!response.ok) {
    // Do not reveal whether an email address is registered.
    const result = await response.json() as { error?: { message?: string } };
    if (result.error?.message === "OPERATION_NOT_ALLOWED") {
      throw new Error("Password recovery is not enabled for this Firebase project.");
    }
  }
}

export async function signInWithGoogleCredential(
  googleIdToken: string,
): Promise<{ idToken: string; email: string }> {
  const postBody = new URLSearchParams({
    id_token: googleIdToken,
    providerId: "google.com",
  }).toString();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${firebaseApiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        postBody,
        requestUri: window.location.origin,
        returnSecureToken: true,
        returnIdpCredential: true,
      }),
    },
  );
  const result = await response.json() as FirebaseAuthResponse;
  if (!response.ok || !result.idToken || !result.refreshToken) {
    throw new Error("Google sign-in could not be completed. Check that Google is enabled in Firebase Authentication.");
  }
  const idToken = await establishWebSession(result.idToken, result.refreshToken);
  return { idToken, email: result.email ?? "" };
}

export async function getWebAuthHeaders(idToken: string): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${idToken}`,
    ...await getWebAppCheckHeaders(),
  };
}

export async function getWebAccount(): Promise<{
  uid: string;
  email: string | null;
  emailVerified: boolean;
} | null> {
  const idToken = await getActiveWebIdToken();
  if (!idToken) return null;
  const response = await fetch("/api/public/v1/auth/web/me", {
    headers: { authorization: `Bearer ${idToken}`, ...await getWebAppCheckHeaders() },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json() as Promise<{
    uid: string;
    email: string | null;
    emailVerified: boolean;
  }>;
}

export async function signOutWeb(): Promise<void> {
  try {
    await fetch("/api/public/v1/auth/web/session/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...await getWebAppCheckHeaders() },
      body: "{}",
    });
  } finally {
    activeIdToken = null;
    activeIdTokenExpiresAt = 0;
  }
}

export const firebaseProject = firebaseProjectId;
