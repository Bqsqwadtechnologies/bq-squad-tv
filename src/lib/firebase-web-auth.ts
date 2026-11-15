const firebaseProjectId = "bq-sqwad-tv";
const firebaseApiKey = "AIzaSyD6QfAIfn_T0YWxxYKDbw8lZfj_s81N2ow"; // Public Firebase web API key; not a server credential.

type FirebaseSignInResponse = {
  idToken?: string;
  email?: string;
  error?: { message?: string };
};

export async function signInWithEmailPassword(email: string, password: string): Promise<{ idToken: string; email: string }> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const result = await response.json() as FirebaseSignInResponse;
  if (!response.ok || !result.idToken) {
    const message = result.error?.message;
    throw new Error(message === "OPERATION_NOT_ALLOWED"
      ? "Email and password sign-in is not enabled for this Firebase project."
      : "Sign-in failed. Check your email and password.");
  }
  return { idToken: result.idToken, email: result.email ?? email };
}

export const firebaseProject = firebaseProjectId;
