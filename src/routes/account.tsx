import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  createAccountWithEmailPassword,
  getWebAccount,
  getActiveWebIdToken,
  getWebAuthHeaders,
  restoreWebSession,
  revokeAllWebSessions,
  sendEmailVerificationCode,
  sendPasswordResetEmail,
  signInWithEmailPassword,
  signInWithGoogleCredential,
  signOutWeb,
  verifyEmailCode,
} from "@/lib/firebase-web-auth";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: { theme: "filled_blue"; size: "large"; shape: "pill"; width: number },
          ) => void;
        };
      };
    };
  }
}

export const Route = createFileRoute("/account")({
  component: AccountPage,
  head: () => ({
    meta: [
      { title: "Your account — BQ SQWAD TV" },
      { name: "description", content: "Sign in or create your BQ SQWAD TV account." },
    ],
  }),
});

function GoogleSignInButton({
  clientId,
  onCredential,
}: {
  clientId: string;
  onCredential: (credential: string) => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!clientId || !element) return;

    const renderButton = () => {
      if (!window.google || !element.isConnected) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: response => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(element, {
        theme: "filled_blue",
        size: "large",
        shape: "pill",
        width: Math.min(320, element.clientWidth || 320),
      });
    };

    let script = document.querySelector<HTMLScriptElement>("script[data-google-identity='true']");
    if (window.google) {
      renderButton();
    } else if (script) {
      script.addEventListener("load", renderButton, { once: true });
    } else {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset["googleIdentity"] = "true";
      script.addEventListener("load", renderButton, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      script?.removeEventListener("load", renderButton);
    };
  }, [clientId, onCredential]);

  return <div ref={elementRef} className="mt-4 flex min-h-11 justify-center" />;
}

function AccountPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [googleClientId, setGoogleClientId] = useState("");
  const [createAccount, setCreateAccount] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [walletCurrency, setWalletCurrency] = useState("USD");
  const [countryReady, setCountryReady] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/public/v1/auth/web/config", { cache: "no-store" })
      .then(response => response.json() as Promise<{ googleClientId?: string }>)
      .then(config => {
        if (active) setGoogleClientId(config.googleClientId ?? "");
      })
      .catch(() => {
        if (active) setGoogleClientId("");
      });
    void (async () => {
      const token = await restoreWebSession();
      if (!token || !active) return;
      const account = await getWebAccount();
      if (!active || !account) return;
      setAccountEmail(account.email ?? "");
      setEmail(account.email ?? "");
      void loadAccountCountry();
      setSignedIn(account.emailVerified);
      setVerificationPending(!account.emailVerified);
      if (!account.emailVerified) {
        setMessage("Verify your email with the six-digit code sent to your inbox.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function loadAccountCountry() {
    const token = await getActiveWebIdToken();
    if (!token) return;
    const response = await fetch("/api/public/v1/profile/country", {
      headers: await getWebAuthHeaders(token),
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json() as { countryCode?: string | null; currency?: string; walletCurrencyLocked?: boolean };
    setCountryReady(true);
    if (data.countryCode) {
      setCountryCode(data.countryCode);
    } else if (!data.walletCurrencyLocked) {
      const region = new Intl.Locale(navigator.language).region;
      if (region && /^[A-Z]{2}$/.test(region)) {
        setCountryCode(region);
        await saveAccountCountry(region, token, false);
        return;
      }
    }
    setWalletCurrency(data.currency ?? "USD");
  }

  async function saveAccountCountry(nextCountry: string, token?: string, showStatus = true) {
    const idToken = token ?? await getActiveWebIdToken();
    if (!idToken) return;
    setCountryReady(false);
    const response = await fetch("/api/public/v1/profile/country", {
      method: "POST",
      headers: {
        ...(await getWebAuthHeaders(idToken)),
        "content-type": "application/json",
      },
      body: JSON.stringify({ countryCode: nextCountry }),
    });
    const result = await response.json() as { currency?: string; error?: string };
    if (!response.ok) {
      if (showStatus) setMessage(result.error ?? "Could not update your country.");
      return;
    }
    setCountryCode(nextCountry);
    setWalletCurrency(result.currency ?? "USD");
    setCountryReady(true);
    if (showStatus) setMessage("Country saved. Your wallet uses " + (result.currency ?? "USD") + ".");
  }

  const continueWithEmailAccount = useCallback(async (accountEmailValue: string) => {
    setEmail(accountEmailValue);
    setAccountEmail(accountEmailValue);
    await loadAccountCountry();
    const account = await getWebAccount();
    if (account?.emailVerified) {
      setSignedIn(true);
      setVerificationPending(false);
      setMessage("You're signed in to BQ SQWAD TV.");
      return;
    }
    const sent = await sendEmailVerificationCode();
    if (sent.alreadyVerified) {
      setSignedIn(true);
      setVerificationPending(false);
      setMessage("You're signed in to BQ SQWAD TV.");
    } else {
      setVerificationPending(true);
      setMessage(sent.sent
        ? "A six-digit verification code has been sent to your email."
        : "Request a new verification code to continue.");
    }
  }, []);

  async function handleAuthentication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = createAccount
        ? await createAccountWithEmailPassword(email, password)
        : await signInWithEmailPassword(email, password);
      await continueWithEmailAccount(result.email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete sign-in.");
    } finally {
      setBusy(false);
    }
  }

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await signInWithGoogleCredential(credential);
      await continueWithEmailAccount(result.email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }, [continueWithEmailAccount]);

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const verified = await verifyEmailCode(code);
      if (!verified) throw new Error("That code could not be verified.");
      setSignedIn(true);
      setVerificationPending(false);
      setCode("");
      setMessage("Your email is verified. You're signed in.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Email verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setBusy(true);
    setMessage("");
    try {
      const result = await sendEmailVerificationCode();
      if (result.alreadyVerified) {
        setSignedIn(true);
        setVerificationPending(false);
        setMessage("Your email is already verified. You're signed in.");
      } else {
        setMessage(result.sent ? "A new six-digit code has been sent." : "A new code could not be sent yet.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not resend the code.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordReset() {
    if (!email.trim()) {
      setMessage("Enter your email address first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await sendPasswordResetEmail(email);
      setMessage("If the address is registered, a password-reset email has been requested.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not request password recovery.");
    } finally {
      setBusy(false);
    }
  }

  async function handleContinue() {
    setBusy(true);
    setMessage("");
    try {
      const token = await restoreWebSession();
      if (!token) throw new Error("Your account session could not be restored. Please sign in again.");
      const account = await getWebAccount();
      if (!account) throw new Error("Your account is not connected yet. Please sign in again.");
      window.location.assign("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open your account.");
      setBusy(false);
    }
  }

  async function handleRevokeAllSessions() {
    setBusy(true);
    setMessage("");
    try {
      await revokeAllWebSessions();
      setSignedIn(false);
      setVerificationPending(false);
      setAccountEmail("");
      setPassword("");
      setCode("");
      setMessage("All active sessions have been revoked. Sign in again on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke your sessions.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutWeb();
      setSignedIn(false);
      setVerificationPending(false);
      setAccountEmail("");
      setPassword("");
      setCode("");
      setMessage("You have signed out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#030b2a] px-4 py-12 text-white">
      <div className="w-full max-w-md">
        <a href="/" className="mb-8 flex justify-center" aria-label="BQ SQWAD TV home">
          <img src="/brand/bq-sqwad-tv-logo.svg" alt="BQ SQWAD TV" className="h-auto w-56 object-contain" />
        </a>
        <section className="rounded-3xl border border-cyan-200/15 bg-[#08163e] p-6 shadow-2xl shadow-blue-950/50 sm:p-8">
          {signedIn ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Account active</p>
              <h1 className="mt-3 text-2xl font-black">Welcome to BQ SQWAD TV</h1>
              <p className="mt-3 break-all text-sm text-blue-100/70">{accountEmail}</p>
              <p className="mt-5 text-sm leading-6 text-blue-100/70">
                Your account is signed in. Your wallet uses the currency assigned to your account country.
              </p>
              <label className="mt-5 block text-sm font-semibold text-blue-50">
                Account country
                <select
                  value={countryCode}
                  onChange={event => void saveAccountCountry(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/15 bg-[#030b2a] px-3 py-3 text-white"
                >
                  <option value="US">United States — USD</option>
                  <option value="NG">Nigeria — NGN</option>
                  <option value="GB">United Kingdom — GBP</option>
                  <option value="GH">Ghana — GHS</option>
                  <option value="KE">Kenya — KES</option>
                  <option value="ZA">South Africa — ZAR</option>
                  <option value="CA">Canada — CAD</option>
                  <option value="AU">Australia — AUD</option>
                  <option value="IN">India — INR</option>
                  <option value="DE">Germany — EUR</option>
                  <option value="FR">France — EUR</option>
                  <option value="JP">Japan — JPY</option>
                </select>
                <span className="mt-1 block text-xs text-blue-100/55">Wallet currency: {walletCurrency}. It cannot be changed after your wallet is established.</span>
              </label>
              <button
                type="button"
                disabled={!countryReady || busy}
                onClick={() => void handleContinue()}
                aria-label="Continue to BQ SQWAD TV"
                className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-3 text-sm font-extrabold text-[#031039] transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
              >
                <img src="/brand/bq-sqwad-tv-logo.svg" alt="" className="h-8 w-auto max-w-[120px] object-contain" />
                <span>Continue</span>
              </button>
              <details className="mt-5 rounded-xl border border-white/10 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-blue-100/70">Account security</summary>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleRevokeAllSessions()}
                                className="mt-3 w-full rounded-xl border border-cyan-300/25 px-4 py-3 text-sm font-bold text-cyan-100 hover:bg-cyan-300/5 disabled:opacity-50"
                              >
                                {busy ? "Please wait…" : "Sign out on all devices"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleSignOut()}
                                className="mt-7 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-bold hover:bg-white/5 disabled:opacity-50"
                              >
                                {busy ? "Please wait…" : "Sign out"}
                              </button>
              </details>
            </>
          ) : verificationPending ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Email verification</p>
              <h1 className="mt-3 text-2xl font-black">Check your inbox</h1>
              <p className="mt-3 text-sm leading-6 text-blue-100/70">
                Enter the six-digit code sent to {email || accountEmail}. It expires after 10 minutes.
              </p>
              <form onSubmit={handleVerify} className="mt-6 space-y-4">
                <label className="block text-sm font-semibold text-blue-50">
                  Verification code
                  <input
                    value={code}
                    onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    className="mt-2 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-cyan-300"
                    placeholder="000000"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || code.length !== 6}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-3 font-extrabold text-[#031039] disabled:opacity-50"
                >
                  {busy ? "Verifying…" : "Verify email"}
                </button>
              </form>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleResend()}
                className="mt-4 w-full text-sm font-semibold text-cyan-200 hover:text-white disabled:opacity-50"
              >
                Resend code
              </button>
            </>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Your account</p>
              <h1 className="mt-3 text-2xl font-black">{createAccount ? "Create your account" : "Welcome back"}</h1>
              <p className="mt-3 text-sm leading-6 text-blue-100/70">
                Sign in to continue to your BQ SQWAD TV experience.
              </p>
              <form onSubmit={handleAuthentication} className="mt-6 space-y-4">
                <label className="block text-sm font-semibold text-blue-50">
                  Email address
                  <input
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                    className="mt-2 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 outline-none focus:border-cyan-300"
                  />
                </label>
                <label className="block text-sm font-semibold text-blue-50">
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    autoComplete={createAccount ? "new-password" : "current-password"}
                    minLength={6}
                    required
                    className="mt-2 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 outline-none focus:border-cyan-300"
                  />
                </label>
                {googleClientId ? (
                  <GoogleSignInButton clientId={googleClientId} onCredential={handleGoogleCredential} />
                ) : (
                  <p className="text-center text-xs text-blue-100/55">
                    Google sign-in will appear here when the Google Web Client ID is configured.
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy || !email.includes("@") || password.length < 6}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-3 font-extrabold text-[#031039] disabled:opacity-50"
                >
                  {busy ? "Please wait…" : createAccount ? "Create account" : "Sign in"}
                </button>
              </form>

              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setCreateAccount(value => !value);
                    setMessage("");
                  }}
                  className="font-semibold text-cyan-200 hover:text-white"
                >
                  {createAccount ? "Already registered? Sign in" : "Create an account"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handlePasswordReset()}
                  className="text-blue-100/70 hover:text-white disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </div>
            </>
          )}
          {message && (
            <p role="status" className="mt-5 rounded-xl border border-cyan-200/15 bg-cyan-300/5 p-3 text-sm leading-6 text-cyan-100">
              {message}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
