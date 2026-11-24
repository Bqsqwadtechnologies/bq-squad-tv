export type ConsoleAccount = {
  uid: string;
  accountId?: string | null;
  profileComplete?: boolean;
  publicId?: string | null;
  email: string | null;
  emailVerified: boolean;
  roles?: string[];
  modules?: string[];
  isOwner?: boolean;
  producerPlanActive?: boolean;
  providerId?: string | null;
};

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
let refreshInFlight: Promise<string | null> | null = null;

async function firebaseAuthRequest(
  operation: "signInWithPassword" | "signUp",
  email: string,
  password: string,
): Promise<{ idToken: string; refreshToken: string; email: string }> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${firebaseApiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...(await getWebAppCheckHeaders()) },
      body: JSON.stringify({ email: email.trim(), password, returnSecureToken: true }),
    },
  );
  const result = (await response.json()) as FirebaseAuthResponse;
  if (!response.ok || !result.idToken || !result.refreshToken) {
    const message = result.error?.message;
    if (message === "OPERATION_NOT_ALLOWED") {
      throw new Error("Email and password sign-in is temporarily unavailable. Please try again shortly.");
    }
    if (message === "EMAIL_EXISTS") throw new Error("An account already exists for this email.");
    if (
      message === "INVALID_PASSWORD" ||
      message === "EMAIL_NOT_FOUND" ||
      message === "INVALID_LOGIN_CREDENTIALS"
    ) {
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

async function establishWebSession(idToken: string, refreshToken: string): Promise<string> {
  const response = await fetch("/api/public/v1/auth/web/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(await getWebAppCheckHeaders()) },
    body: JSON.stringify({ idToken, refreshToken }),
  });
  const result = (await response.json()) as WebSessionResponse;
  if (!response.ok || !result.idToken) {
    throw new Error(result.error ?? "Could not establish a secure website session.");
  }
  activeIdToken = result.idToken;
  activeIdTokenExpiresAt =
    Date.now() + Math.max(60, result.expiresInSeconds ?? 3600) * 1000 - 60_000;
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
  // Several components can mount together and ask for a token. Refresh tokens
  // rotate on every successful refresh, so serialize refreshes to prevent
  // concurrent requests from invalidating one another's cookie.
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const response = await fetch("/api/public/v1/auth/web/session/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", ...(await getWebAppCheckHeaders()) },
        body: "{}",
      });
      const result = (await response.json()) as WebSessionResponse;
      if (!response.ok || !result.idToken) {
        // A temporary server/App Check failure is not proof that the user's
        // refresh cookie is invalid. Only clear local token state on auth denial.
        if (response.status === 401 || response.status === 403) {
          activeIdToken = null;
          activeIdTokenExpiresAt = 0;
        }
        return null;
      }
      activeIdToken = result.idToken;
      activeIdTokenExpiresAt =
        Date.now() + Math.max(60, result.expiresInSeconds ?? 3600) * 1000 - 60_000;
      return activeIdToken;
    } catch {
      return null;
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function getActiveWebIdToken(): Promise<string | null> {
  if (activeIdToken && Date.now() < activeIdTokenExpiresAt) return activeIdToken;
  return restoreWebSession();
}

export async function sendEmailVerificationCode(): Promise<{
  sent: boolean;
  alreadyVerified: boolean;
}> {
  const idToken = await getActiveWebIdToken();
  if (!idToken) throw new Error("Sign in again to verify your email.");
  const response = await fetch("/api/public/v1/auth/email/send-code", {
    method: "POST",
    headers: { authorization: `Bearer ${idToken}`, ...(await getWebAppCheckHeaders()) },
  });
  const result = (await response.json()) as {
    sent?: boolean;
    alreadyVerified?: boolean;
    error?: string;
  };
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
      ...(await getWebAppCheckHeaders()),
    },
    body: JSON.stringify({ code }),
  });
  const result = (await response.json()) as { verified?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error ?? "Email verification failed.");
  return result.verified === true;
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseApiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...(await getWebAppCheckHeaders()) },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email: email.trim() }),
    },
  );
  if (!response.ok) {
    // Do not reveal whether an email address is registered.
    const result = (await response.json()) as { error?: { message?: string } };
    if (result.error?.message === "OPERATION_NOT_ALLOWED") {
      throw new Error("Password recovery is temporarily unavailable. Please try again shortly.");
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
      headers: { "content-type": "application/json", ...(await getWebAppCheckHeaders()) },
      body: JSON.stringify({
        postBody,
        requestUri: window.location.origin,
        returnSecureToken: true,
        returnIdpCredential: true,
      }),
    },
  );
  const result = (await response.json()) as FirebaseAuthResponse;
  if (!response.ok || !result.idToken || !result.refreshToken) {
    const code = result.error?.message ?? "";
    const messages: Record<string, string> = {
      OPERATION_NOT_ALLOWED: "Google sign-in is temporarily unavailable. Please try signing in with your email or check back shortly.",
      INVALID_IDP_RESPONSE: "Google did not return a valid identity response. Check the OAuth web client configuration.",
      FEDERATED_USER_ID_ALREADY_LINKED: "This Google account is already linked to another BQ SQWAD TV account. Sign in with the linked account.",
      CREDENTIAL_TOO_OLD_LOGIN_AGAIN: "Your Google sign-in expired. Please try again.",
      INVALID_LOGIN_CREDENTIALS: "Google could not verify this sign-in. Check the OAuth client and authorized domain settings.",
      ADMIN_ONLY_OPERATION: "Account creation is currently restricted. Please contact support.",
    };
    throw new Error(messages[code] ?? "Unable to complete Google sign-in at this time. Please try signing in with your email.");
  }
  const idToken = await establishWebSession(result.idToken, result.refreshToken);
  return { idToken, email: result.email ?? "" };
}

export async function getWebAuthHeaders(idToken: string): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${idToken}`,
    ...(await getWebAppCheckHeaders()),
  };
}

export async function getWebAccount(): Promise<ConsoleAccount | null> {
  const idToken = await getActiveWebIdToken();
  if (!idToken) return null;
  const response = await fetch("/api/public/v1/auth/web/me", {
    headers: { authorization: `Bearer ${idToken}`, ...(await getWebAppCheckHeaders()) },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("The account session could not be verified. Please retry.");
  const account = (await response.json()) as ConsoleAccount;
  if (typeof account.uid !== "string" || !account.uid) return null;
  return account;
}

export async function revokeAllWebSessions(): Promise<void> {
  const idToken = await getActiveWebIdToken();
  if (!idToken) throw new Error("Sign in again before revoking your sessions.");
  const response = await fetch("/api/public/v1/auth/session/revoke-all", {
    method: "POST",
    credentials: "same-origin",
    headers: { authorization: `Bearer ${idToken}`, ...(await getWebAppCheckHeaders()) },
    cache: "no-store",
  });
  const result = (await response.json()) as { revoked?: boolean; error?: string };
  if (!response.ok || result.revoked !== true) {
    throw new Error(result.error ?? "Could not revoke your other sessions.");
  }
  await signOutWeb();
}

export async function signOutWeb(): Promise<void> {
  try {
    const response = await fetch("/api/public/v1/auth/web/session/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(await getWebAppCheckHeaders()) },
      body: "{}",
    });
    if (!response.ok) throw new Error("The server could not end your website session.");
  } finally {
    activeIdToken = null;
    activeIdTokenExpiresAt = 0;
  }
}

export const firebaseProject = firebaseProjectId;
