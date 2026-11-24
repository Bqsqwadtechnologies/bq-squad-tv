import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getActiveWebIdToken, getWebAccount, getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/profile/setup")({ component: ProfileSetupPage });

type LegalPage = { slug: string; title: string; body: string; version: number; accepted: boolean };

function ProfileSetupPage() {
  const [ready, setReady] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(true);
  const [pages, setPages] = useState<LegalPage[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
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
        if (account.emailVerified !== true) {
          window.location.replace("/account");
          return;
        }
        setNeedsProfile(account.profileComplete !== true);
        const response = await fetch("/api/public/v1/legal/status?audience=public", {
          headers: await getWebAuthHeaders(token),
          cache: "no-store",
        });
        if (!response.ok) throw new Error("We could not verify the current Terms and Privacy Policy.");
        const result = (await response.json()) as { pages?: LegalPage[] };
        if (!active) return;
        setPages(result.pages ?? []);
        setReady(true);
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Account setup is temporarily unavailable.");
          setReady(true);
        }
      }
    })();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const token = await getActiveWebIdToken();
      if (!token) throw new Error("Your sign-in session expired. Please sign in again.");
      if (!accepted) throw new Error("Please review and accept the Terms and Privacy Policy.");
      const requiredSlugs = pages.filter((page) => !page.accepted).map((page) => page.slug);
      if (requiredSlugs.length) {
        const legalResponse = await fetch("/api/public/v1/legal/acceptance", {
          method: "POST",
          headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
          body: JSON.stringify({ audience: "public", acceptedSlugs: requiredSlugs }),
        });
        const legalResult = (await legalResponse.json()) as { accepted?: boolean; error?: string };
        if (!legalResponse.ok || legalResult.accepted !== true) {
          throw new Error(legalResult.error ?? "Your legal acceptance could not be saved.");
        }
      }
      if (needsProfile) {
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateOfBirth)) {
          throw new Error("Enter your date of birth in YYYY-MM-DD format.");
        }
        const profileResponse = await fetch("/api/public/v1/profile/complete", {
          method: "POST",
          headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
          body: JSON.stringify({ dateOfBirth, parentalPin: null }),
        });
        const profileResult = (await profileResponse.json()) as { profileComplete?: boolean; error?: string };
        if (!profileResponse.ok || profileResult.profileComplete !== true) {
          throw new Error(profileResult.error ?? "Your profile could not be completed.");
        }
      }
      window.location.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account setup could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="min-h-screen grid place-items-center bg-background text-foreground"><p>Preparing your account…</p></main>;

  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-12">
      <section className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Finish setting up your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your country and wallet currency are detected automatically from your connection. You do not need to select a country.</p>
        <form onSubmit={submit} className="mt-6 space-y-5">
          {needsProfile && (
            <label className="block text-sm font-medium">
              Date of birth
              <input
                type="date"
                required
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
          )}
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">Please review the current legal documents:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><a className="underline" href="/legal/terms" target="_blank" rel="noreferrer">Terms of Service</a></li>
              <li><a className="underline" href="/legal/privacy-policy" target="_blank" rel="noreferrer">Privacy Policy</a></li>
            </ul>
            <label className="mt-3 flex items-start gap-2">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>I have read and accept the applicable Terms and Privacy Policy.</span>
            </label>
          </div>
          {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
          <button disabled={busy || !accepted} className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "Saving…" : "Continue to Home"}
          </button>
        </form>
      </section>
    </main>
  );
}
