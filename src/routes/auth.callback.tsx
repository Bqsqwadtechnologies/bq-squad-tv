import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getWebAccount, getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/auth/callback")({ component: AuthCallbackPage });

function AuthCallbackPage() {
  const [message, setMessage] = useState("Completing your sign-in…");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // Firebase's persisted session is the source of truth. Do not trust
        // arbitrary access tokens copied from callback query/hash parameters.
        const token = await restoreWebSession();
        if (!token) {
          window.location.replace("/account");
          return;
        }
        const account = await getWebAccount();
        if (!account) {
          window.location.replace("/account");
          return;
        }
        if (!account.emailVerified) {
          window.location.replace("/account");
          return;
        }
        if (account.profileComplete !== true) {
          window.location.replace("/profile/setup");
          return;
        }
        const legalResponse = await fetch("/api/public/v1/legal/status?audience=public", {
          headers: await getWebAuthHeaders(token),
          cache: "no-store",
        });
        if (!legalResponse.ok) throw new Error("Legal status could not be checked.");
        const legal = (await legalResponse.json()) as { acceptanceRequired?: boolean };
        if (legal.acceptanceRequired) {
          window.location.replace("/account");
          return;
        }
        window.location.replace("/");
      } catch {
        if (active) setMessage("We could not complete sign-in. Please return to the account page and try again.");
      }
    })();
    return () => { active = false; };
  }, []);

  return <main className="min-h-screen grid place-items-center bg-background px-4 text-foreground"><p role="status">{message}</p></main>;
}
