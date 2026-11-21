import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
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

export const Route = createFileRoute("/account")({
  component: AccountPage,
  head: () => ({
    meta: [
      { title: "Your account — BQ SQWAD TV" },
      { name: "description", content: "Sign in or create your BQ SQWAD TV account." },
    ],
  }),
});

let cachedGoogleClientId: string | null = null;

function AccountPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
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
  const [walletBalanceMinor, setWalletBalanceMinor] = useState<number | null>(null);
  type ViewerAnalyticsData = {
    summary: {
      totalMinutesWatched: number;
      totalHoursWatched: number;
      totalSessionsCount: number;
      totalSpentMinor: number;
    };
    channels: Array<{
      channelId: string;
      title: string;
      minutesWatched: number;
      lastWatchedAt: string;
    }>;
    videos: Array<{
      assetId: string;
      title: string;
      minutesWatched: number;
      lastWatchedAt: string;
    }>;
    recentHistory: Array<{
      id: string;
      title: string;
      channelId?: string;
      minutes: number;
      watchedAt: string;
    }>;
  };

  const [viewerAnalytics, setViewerAnalytics] = useState<ViewerAnalyticsData | null>(null);

  const [showSettingsView, setShowSettingsView] = useState(false);
  const [countryReady, setCountryReady] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [legalConsentAccepted, setLegalConsentAccepted] = useState(false);
  const [legalAcceptanceRequired, setLegalAcceptanceRequired] = useState(false);
  const [legalAcceptanceBusy, setLegalAcceptanceBusy] = useState(false);
  const [legalPages, setLegalPages] = useState<
    Array<{ slug: string; title: string; version: number; accepted: boolean }>
  >([]);

  useEffect(() => {
    const storedTheme = localStorage.getItem("bq-sqwad-theme");
    const initialTheme = storedTheme === "dark" ? "dark" : "light";
    setThemeMode(initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");
    document.documentElement.classList.toggle("light", initialTheme === "light");
    let active = true;
    if (cachedGoogleClientId !== null) {
      setGoogleClientId(cachedGoogleClientId);
    } else {
      void fetch("/api/public/v1/auth/web/config", { cache: "no-store" })
        .then((response) => response.json() as Promise<{ googleClientId?: string }>)
        .then((config) => {
          cachedGoogleClientId = config.googleClientId ?? "";
          if (active) setGoogleClientId(cachedGoogleClientId);
        })
        .catch(() => {
          if (active) setGoogleClientId("");
        });
    }
    void (async () => {
      const token = await restoreWebSession();
      if (!token || !active) return;
      const account = await getWebAccount();
      if (!active || !account) return;
      setAccountEmail(account.email ?? "");
      setEmail(account.email ?? "");
      void loadAccountCountry();
      try {
        const preferenceResponse = await fetch("/api/public/v1/profile/preferences", {
          headers: await getWebAuthHeaders(token),
          cache: "no-store",
        });
        if (preferenceResponse.ok) {
          const preference = (await preferenceResponse.json()) as { themeMode?: string };
          if (preference.themeMode === "light" || preference.themeMode === "dark") {
            setThemeMode(preference.themeMode);
            localStorage.setItem("bq-sqwad-theme", preference.themeMode);
            document.documentElement.classList.toggle("dark", preference.themeMode === "dark");
            document.documentElement.classList.toggle("light", preference.themeMode === "light");
          }
        }
      } catch {
        // Keep the saved device preference when account sync is unavailable.
      }
      setSignedIn(account.emailVerified);
      setVerificationPending(!account.emailVerified);
      if (account.emailVerified) {
        try {
          const needsAcceptance = await loadLegalStatus();
          if (needsAcceptance)
            setMessage("Please review and accept the updated service terms before continuing.");
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : "The current legal pages could not be checked.",
          );
        }
      } else {
        setMessage("Verify your email with the six-digit code sent to your inbox.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function saveThemePreference(next: "light" | "dark") {
    setThemeMode(next);
    localStorage.setItem("bq-sqwad-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.classList.toggle("light", next === "light");
    const token = await getActiveWebIdToken();
    if (!token) return;
    try {
      const response = await fetch("/api/public/v1/profile/preferences", {
        method: "PUT",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({ themeMode: next }),
      });
      if (!response.ok)
        setMessage(
          "Your appearance is saved on this device. Account sync is temporarily unavailable.",
        );
    } catch {
      setMessage(
        "Your appearance is saved on this device. Account sync is temporarily unavailable.",
      );
    }
  }

  async function loadAccountCountry() {
    const token = await getActiveWebIdToken();
    if (!token) return;
    const response = await fetch("/api/public/v1/profile/country", {
      headers: await getWebAuthHeaders(token),
      cache: "no-store",
    });
    if (response.ok) {
      const data = (await response.json()) as {
        countryCode?: string | null;
        currency?: string;
        walletCurrencyLocked?: boolean;
      };
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
    // Also load wallet balance
    try {
      const walletRes = await fetch("/api/public/v1/wallet", {
        headers: await getWebAuthHeaders(token),
        cache: "no-store",
      });
      if (walletRes.ok) {
        const wdata = (await walletRes.json()) as { balanceMinor?: number; currency?: string };
        if (typeof wdata.balanceMinor === "number") setWalletBalanceMinor(wdata.balanceMinor);
        if (wdata.currency) setWalletCurrency(wdata.currency);
      }
    } catch {
      // Wallet balance optional
    }
    try {
      const analyticsRes = await fetch("/api/public/v1/analytics/viewer", {
        headers: await getWebAuthHeaders(token),
        cache: "no-store",
      });
      if (analyticsRes.ok) {
        const vdata = (await analyticsRes.json()) as ViewerAnalyticsData;
        setViewerAnalytics(vdata);
      }
    } catch {
      // Viewer analytics optional
    }
  }

  async function saveAccountCountry(nextCountry: string, token?: string, showStatus = true) {
    const idToken = token ?? (await getActiveWebIdToken());
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
    const result = (await response.json()) as { currency?: string; error?: string };
    if (!response.ok) {
      if (showStatus) setMessage(result.error ?? "Could not update your country.");
      return;
    }
    setCountryCode(nextCountry);
    setWalletCurrency(result.currency ?? "USD");
    setCountryReady(true);
    if (showStatus)
      setMessage("Country saved. Your wallet uses " + (result.currency ?? "USD") + ".");
  }

  async function loadLegalStatus() {
    const token = await getActiveWebIdToken();
    if (!token) throw new Error("Sign in again to review the current service terms.");
    const response = await fetch("/api/public/v1/legal/status?audience=public", {
      headers: await getWebAuthHeaders(token),
      cache: "no-store",
    });
    const result = (await response.json()) as {
      pages?: Array<{ slug: string; title: string; version: number; accepted: boolean }>;
      acceptanceRequired?: boolean;
      error?: string;
    };
    if (!response.ok || !result.pages)
      throw new Error(result.error ?? "The current legal pages could not be checked.");
    setLegalPages(result.pages);
    setLegalAcceptanceRequired(result.acceptanceRequired === true);
    return result.acceptanceRequired === true;
  }

  async function acceptCurrentLegalPages() {
    setLegalAcceptanceBusy(true);
    try {
      const token = await getActiveWebIdToken();
      if (!token) throw new Error("Sign in again to continue.");
      const response = await fetch("/api/public/v1/legal/acceptance", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({
          audience: "public",
          acceptedSlugs: legalPages.map((page) => page.slug),
        }),
      });
      const result = (await response.json()) as { accepted?: boolean; error?: string };
      if (!response.ok || !result.accepted)
        throw new Error(result.error ?? "Your acceptance could not be saved.");
      setLegalAcceptanceRequired(false);
      setMessage("Your acceptance has been saved. You can continue.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your acceptance could not be saved.");
    } finally {
      setLegalAcceptanceBusy(false);
    }
  }

  const continueWithEmailAccount = useCallback(async (accountEmailValue: string) => {
    setEmail(accountEmailValue);
    setAccountEmail(accountEmailValue);
    await loadAccountCountry();
    const account = await getWebAccount();
    if (account?.emailVerified) {
      setSignedIn(true);
      setVerificationPending(false);
      const needsAcceptance = await loadLegalStatus();
      setMessage(
        needsAcceptance
          ? "Please review and accept the updated service terms before continuing."
          : "You're signed in to BQ SQWAD TV.",
      );
      return;
    }
    try {
      const sent = await sendEmailVerificationCode();
      if (sent.alreadyVerified) {
        setSignedIn(true);
        setVerificationPending(false);
        const needsAcceptance = await loadLegalStatus();
        setMessage(
          needsAcceptance
            ? "Please review and accept the updated service terms before continuing."
            : "You're signed in to BQ SQWAD TV.",
        );
      } else {
        setVerificationPending(true);
        setMessage(
          sent.sent
            ? "A six-digit verification code has been sent to your email."
            : "We couldn't send your code. Try again in a minute.",
        );
      }
    } catch {
      setVerificationPending(true);
      setMessage("We couldn't send your code. Try again in a minute.");
    }
  }, []);

  async function handleAuthentication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (createAccount) {
        if (!legalConsentAccepted)
          throw new Error(
            "Read and accept the Terms and Privacy Policy before creating your account.",
          );
        if (!dateOfBirth)
          throw new Error("Enter your date of birth to finish creating your account.");
        for (const slug of ["terms", "privacy-policy"]) {
          const legalResponse = await fetch("/api/public/v1/pages/" + slug, { cache: "no-store" });
          if (!legalResponse.ok)
            throw new Error(
              "Account creation is temporarily unavailable until our Terms and Privacy Policy are published.",
            );
        }
      }
      const result = createAccount
        ? await createAccountWithEmailPassword(email, password)
        : await signInWithEmailPassword(email, password);
      if (createAccount) {
        if (!dateOfBirth)
          throw new Error("Enter your date of birth to finish creating your account.");
        const idToken = await getActiveWebIdToken();
        if (!idToken)
          throw new Error(
            "Your account was created, but its profile could not be completed. Sign in again to continue.",
          );
        const region = new Intl.Locale(navigator.language).region;
        const acceptanceResponse = await fetch("/api/public/v1/legal/acceptance", {
          method: "POST",
          headers: { ...(await getWebAuthHeaders(idToken)), "content-type": "application/json" },
          body: JSON.stringify({ audience: "public", acceptedSlugs: ["terms", "privacy-policy"] }),
        });
        const acceptanceResult = (await acceptanceResponse.json()) as {
          accepted?: boolean;
          error?: string;
        };
        if (!acceptanceResponse.ok || !acceptanceResult.accepted)
          throw new Error(acceptanceResult.error ?? "Your acceptance could not be saved.");
        const profileResponse = await fetch("/api/public/v1/profile/complete", {
          method: "POST",
          headers: { ...(await getWebAuthHeaders(idToken)), "content-type": "application/json" },
          body: JSON.stringify({
            dateOfBirth,
            parentalPin: null,
            ...(region && /^[A-Z]{2}$/.test(region) ? { countryCode: region } : {}),
          }),
        });
        const profileResult = (await profileResponse.json()) as { error?: string };
        if (!profileResponse.ok)
          throw new Error(profileResult.error ?? "Your account profile could not be completed.");
      }
      await continueWithEmailAccount(result.email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete sign-in.");
    } finally {
      setBusy(false);
    }
  }

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
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
    },
    [continueWithEmailAccount],
  );

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
      const needsAcceptance = await loadLegalStatus();
      setMessage(
        needsAcceptance
          ? "Please review and accept the updated service terms before continuing."
          : "Your email is verified. You're signed in.",
      );
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
        const needsAcceptance = await loadLegalStatus();
        setMessage(
          needsAcceptance
            ? "Please review and accept the updated service terms before continuing."
            : "Your email is already verified. You're signed in.",
        );
      } else {
        setMessage(
          result.sent ? "A new six-digit code has been sent." : "A new code could not be sent yet.",
        );
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
      if (!token)
        throw new Error("Your account session could not be restored. Please sign in again.");
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

  async function handleDeleteAccount() {
    if (
      !window.confirm(
        "Are you sure you want to delete your account? This action is permanent and will delete or anonymise your personal data.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const token = await getActiveWebIdToken();
      if (!token) throw new Error("Sign in again to confirm account deletion.");
      const response = await fetch("/api/public/v1/account/delete", {
        method: "POST",
        headers: await getWebAuthHeaders(token),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not complete account deletion.");
      await revokeAllWebSessions();
      setSignedIn(false);
      setVerificationPending(false);
      setAccountEmail("");
      setMessage("Your account and personal data have been deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account deletion failed.");
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
          <BrandLogo variant="horizontal" className="h-10 w-auto" />
        </a>
        <label className="mb-4 block text-sm font-semibold text-blue-50">
          Appearance
          <select
            value={themeMode}
            onChange={(event) => void saveThemePreference(event.target.value as "light" | "dark")}
            className="mt-2 w-full rounded-xl border border-white/15 bg-[#030b2a] px-3 py-3 text-white"
            aria-label="Choose appearance"
          >
            <option value="light">White theme</option>
            <option value="dark">Dark navy theme</option>
          </select>
        </label>
        <section className="rounded-3xl border border-cyan-200/15 bg-[#08163e] p-6 shadow-2xl shadow-blue-950/50 sm:p-8">
          {legalAcceptanceRequired ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                Updated terms
              </p>
              <h1 className="mt-3 text-2xl font-black">Please review these pages</h1>
              <p className="mt-3 text-sm leading-6 text-blue-100/70">
                We have updated one or more documents. Review each current version before continuing
                to watch.
              </p>
              <ul className="mt-5 space-y-3">
                {legalPages.map((page) => (
                  <li
                    key={page.slug}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#030b2a] p-3 text-sm"
                  >
                    <span>
                      {page.title} · version {page.version}
                    </span>
                    <a
                      className="font-bold text-cyan-200 underline"
                      href={"/legal/" + page.slug}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Review
                    </a>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void acceptCurrentLegalPages()}
                disabled={legalAcceptanceBusy}
                className="mt-6 w-full rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-3 font-extrabold text-[#031039] disabled:opacity-50"
              >
                {legalAcceptanceBusy ? "Saving acceptance…" : "I have reviewed and accept"}
              </button>
            </>
          ) : signedIn ? (
            <>
              <div className="flex items-center gap-4 border-b border-white/10 pb-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-400 to-blue-600 text-2xl font-black text-[#031039] shadow-lg shadow-cyan-500/20">
                  {(accountEmail[0] || "V").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="inline-block rounded-full bg-cyan-400/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                    Viewer
                  </span>
                  <h1 className="mt-1 text-xl font-black truncate">{accountEmail.split("@")[0]}</h1>
                  <p className="text-xs text-blue-100/60 truncate">{accountEmail}</p>
                </div>
              </div>

              {/* Wallet Balance Card */}
              <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-gradient-to-r from-[#0d2258] to-[#07173e] p-5 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Available Balance
                  </span>
                  <a
                    href="/wallet"
                    className="text-xs font-bold text-cyan-200 underline hover:text-white"
                  >
                    Top Up
                  </a>
                </div>
                <div className="mt-2 text-2xl font-black text-white">
                  {walletBalanceMinor !== null ? (walletBalanceMinor / 100).toFixed(2) : "0.00"}{" "}
                  {walletCurrency}
                </div>
                <p className="mt-1 text-[11px] text-blue-100/50">
                  Wallet currency is tied to your account country.
                </p>
              </div>

              {/* Viewer Activity & Watch Time Card */}
              {viewerAnalytics && (
                <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-[#0c1f4e] to-[#040f2e] p-5 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                        My Watch Time &amp; Activity
                      </span>
                    </div>
                    <a
                      href="/history"
                      className="text-xs font-bold text-cyan-200 underline hover:text-white"
                    >
                      Full History
                    </a>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-[#030b2a] p-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100/60">
                        Total Watch Time
                      </span>
                      <div className="mt-1 text-xl font-black text-white">
                        {viewerAnalytics.summary.totalMinutesWatched}{" "}
                        <span className="text-xs font-normal text-cyan-300">mins</span>
                      </div>
                      <p className="text-[10px] text-blue-100/50">
                        {viewerAnalytics.summary.totalHoursWatched} hrs total
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-[#030b2a] p-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100/60">
                        Viewing Sessions
                      </span>
                      <div className="mt-1 text-xl font-black text-white">
                        {viewerAnalytics.summary.totalSessionsCount}
                      </div>
                      <p className="text-[10px] text-blue-100/50">Streams watched</p>
                    </div>
                  </div>

                  {viewerAnalytics.channels && viewerAnalytics.channels.length > 0 && (
                    <div className="mt-4 border-t border-white/10 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-100/70">
                        Watch Time by Channel
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {viewerAnalytics.channels.slice(0, 3).map((ch) => (
                          <div
                            key={ch.channelId}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="truncate text-white font-medium">{ch.title}</span>
                            <span className="font-bold text-cyan-300 ml-2">
                              {ch.minutesWatched}m
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {viewerAnalytics.videos && viewerAnalytics.videos.length > 0 && (
                    <div className="mt-3 border-t border-white/10 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-100/70">
                        Watch Time by Video
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {viewerAnalytics.videos.slice(0, 3).map((vid) => (
                          <div
                            key={vid.assetId}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="truncate text-white font-medium">{vid.title}</span>
                            <span className="font-bold text-cyan-300 ml-2">
                              {vid.minutesWatched}m
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Account Navigation Grid */}
              <nav aria-label="Account shortcuts" className="mt-5 grid grid-cols-2 gap-3">
                <a
                  href="/wallet"
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-3 text-sm font-bold text-blue-50 hover:border-cyan-300/30 transition"
                >
                  <span>My Wallet</span>
                  <span className="text-cyan-300 text-xs font-bold">›</span>
                </a>
                <a
                  href="/wallet#purchases"
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-3 text-sm font-bold text-blue-50 hover:border-cyan-300/30 transition"
                >
                  <span>My Purchases</span>
                  <span className="text-cyan-300 text-xs font-bold">›</span>
                </a>
                <a
                  href="/history"
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-3 text-sm font-bold text-blue-50 hover:border-cyan-300/30 transition"
                >
                  <span>Watch History</span>
                  <span className="text-cyan-300 text-xs font-bold">›</span>
                </a>
                <a
                  href="/notifications"
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-3 text-sm font-bold text-blue-50 hover:border-cyan-300/30 transition"
                >
                  <span>Notifications</span>
                  <span className="text-cyan-300 text-xs font-bold">›</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowSettingsView((v) => !v)}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-3 text-sm font-bold text-blue-50 hover:border-cyan-300/30 transition text-left"
                >
                  <span>Settings</span>
                  <span className="text-cyan-300 text-xs font-bold">
                    {showSettingsView ? "▴" : "▾"}
                  </span>
                </button>
                <a
                  href="/help"
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-3 text-sm font-bold text-blue-50 hover:border-cyan-300/30 transition"
                >
                  <span>Help &amp; Support</span>
                  <span className="text-cyan-300 text-xs font-bold">›</span>
                </a>
              </nav>

              {/* Collapsible Settings view */}
              {showSettingsView && (
                <div className="mt-4 rounded-xl border border-white/10 bg-[#030b2a]/80 p-4 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Settings &amp; Preferences
                  </p>
                  <label className="block text-xs font-semibold text-blue-100/80">
                    Account Country
                    <select
                      value={countryCode}
                      onChange={(event) => void saveAccountCountry(event.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#030b2a] px-3 py-2 text-sm text-white"
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
                    <span className="mt-1 block text-[11px] text-blue-100/50">
                      Wallet currency: {walletCurrency}. It cannot be changed after your wallet is
                      established.
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRevokeAllSessions()}
                    className="w-full rounded-lg border border-cyan-300/25 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-300/5 disabled:opacity-50"
                  >
                    {busy ? "Please wait…" : "Sign out on all devices"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDeleteAccount()}
                    className="w-full rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    Delete Account &amp; Personal Data
                  </button>
                </div>
              )}

              {/* Consoles Section */}
              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                  Consoles
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <a
                    href="/producer"
                    className="flex flex-col items-center justify-center rounded-xl border border-cyan-400/20 bg-[#030b2a] p-3 text-center text-sm font-bold text-cyan-100 hover:border-cyan-300 hover:bg-cyan-500/5 transition"
                  >
                    <span>Producer Console</span>
                    <span className="mt-0.5 text-[10px] font-normal text-blue-100/50">
                      Content management
                    </span>
                  </a>
                  <a
                    href="/provider"
                    className="flex flex-col items-center justify-center rounded-xl border border-cyan-400/20 bg-[#030b2a] p-3 text-center text-sm font-bold text-cyan-100 hover:border-cyan-300 hover:bg-cyan-500/5 transition"
                  >
                    <span>Provider Console</span>
                    <span className="mt-0.5 text-[10px] font-normal text-blue-100/50">
                      Channel licensing
                    </span>
                  </a>
                </div>
              </div>

              {/* Sign out and Continue Buttons */}
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  disabled={!countryReady || busy}
                  onClick={() => void handleContinue()}
                  aria-label="Continue to BQ SQWAD TV"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-3 text-sm font-extrabold text-[#031039] transition hover:brightness-110 disabled:opacity-50"
                >
                  <img
                    src="/brand/bq-sqwad-tv-logo.png"
                    alt=""
                    className="h-6 w-auto object-contain"
                  />
                  <span>Continue Watching</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSignOut()}
                  className="w-full rounded-xl border border-white/15 px-4 py-2.5 text-xs font-bold text-blue-100/70 hover:text-white hover:bg-white/5 disabled:opacity-50"
                >
                  {busy ? "Please wait…" : "Sign out"}
                </button>
              </div>
            </>
          ) : verificationPending ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                Email verification
              </p>
              <h1 className="mt-3 text-2xl font-black">Check your inbox</h1>
              <p className="mt-3 text-sm leading-6 text-blue-100/70">
                Enter the six-digit code sent to {email || accountEmail}. It expires after 10
                minutes.
              </p>
              <form onSubmit={handleVerify} className="mt-6 space-y-4">
                <label className="block text-sm font-semibold text-blue-50">
                  Verification code
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
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
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                Your account
              </p>
              <h1 className="mt-3 text-2xl font-black">
                {createAccount ? "Create your account" : "Welcome back"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-blue-100/70">
                Sign in to continue to your BQ SQWAD TV experience.
              </p>
              <form onSubmit={handleAuthentication} className="mt-6 space-y-4">
                {createAccount ? (
                  <label className="block text-sm font-semibold text-blue-50">
                    Date of birth
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={(event) => setDateOfBirth(event.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                      required
                      className="mt-2 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300"
                    />
                  </label>
                ) : null}
                <label className="block text-sm font-semibold text-blue-50">
                  Email address
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
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
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={createAccount ? "new-password" : "current-password"}
                    minLength={6}
                    required
                    className="mt-2 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 outline-none focus:border-cyan-300"
                  />
                </label>
                <GoogleSignInButton
                  clientId={googleClientId || undefined}
                  onCredential={handleGoogleCredential}
                  disabled={busy}
                  onRetry={() => {
                    cachedGoogleClientId = null;
                    void fetch("/api/public/v1/auth/web/config", { cache: "no-store" })
                      .then((r) => r.json() as Promise<{ googleClientId?: string }>)
                      .then((c) => {
                        cachedGoogleClientId = c.googleClientId ?? "";
                        setGoogleClientId(cachedGoogleClientId);
                      })
                      .catch(() => setGoogleClientId(""));
                  }}
                />
                <button
                  type="submit"
                  disabled={
                    busy ||
                    !email.includes("@") ||
                    password.length < 6 ||
                    (createAccount && (!dateOfBirth || !legalConsentAccepted))
                  }
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-3 font-extrabold text-[#031039] disabled:opacity-50"
                >
                  {busy ? "Please wait…" : createAccount ? "Create account" : "Sign in"}
                </button>
              </form>
              {createAccount ? (
                <label className="mt-3 flex items-start gap-3 text-xs leading-5 text-blue-100/70">
                  <input
                    type="checkbox"
                    checked={legalConsentAccepted}
                    onChange={(event) => setLegalConsentAccepted(event.target.checked)}
                    className="mt-1 size-4 accent-cyan-300"
                    required
                  />
                  <span>
                    I have read and accept the{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4 text-cyan-200"
                    >
                      Terms of service
                    </a>{" "}
                    and{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4 text-cyan-200"
                    >
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>
              ) : null}

              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setCreateAccount((value) => !value);
                    setLegalConsentAccepted(false);
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
            <p
              role="status"
              className="mt-5 rounded-xl border border-cyan-200/15 bg-cyan-300/5 p-3 text-sm leading-6 text-cyan-100"
            >
              {message}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
