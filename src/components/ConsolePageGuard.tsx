import { useEffect, useState, type ReactNode } from "react";
import { restoreWebSession, getWebAuthHeaders, signInWithEmailPassword, createAccountWithEmailPassword, sendPasswordResetEmail, signOutWeb } from "@/lib/firebase-web-auth";
import { NotFoundView } from "@/components/NotFoundView";

export type ConsoleRole = "zillionaire" | "producer" | "provider" | "admin";

export type ConsoleAccount = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  roles: string[];
  isOwner: boolean;
  needsOwnerVerification?: boolean;
  modules: string[];
  producerPlanActive?: boolean;
  providerId?: string | null;
};

export interface ConsolePageGuardProps {
  role: ConsoleRole;
  module?: string;
  children:
    | ReactNode
    | ((props: { token: string; account: ConsoleAccount; onLock?: () => void }) => ReactNode);
}

function OwnerVerificationView({ token, email }: { token: string; email: string }) {
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resendStatus, setResendStatus] = useState("");

  async function handleSendCode() {
    setBusy(true);
    setResendStatus("");
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/auth/email/send-code", {
        method: "POST",
        headers,
      });
      const data = (await res.json()) as {
        sent?: boolean;
        alreadyVerified?: boolean;
        error?: string;
      };
      if (data.alreadyVerified) {
        window.location.reload();
      } else if (data.sent) {
        setResendStatus("A new six-digit verification code has been sent to your email.");
      } else {
        setResendStatus(data.error || "Could not send verification code.");
      }
    } catch {
      setResendStatus("Network error while sending code.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setMessage("");
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/auth/email/verify-code", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { verified?: boolean; error?: string };
      if (data.verified) {
        window.location.reload();
      } else {
        setMessage(data.error || "Invalid verification code. Please check and try again.");
      }
    } catch {
      setMessage("Verification request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#030b2a] px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-cyan-200/20 bg-[#08163e] p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="h-10 w-auto" />
        </div>
        <div className="inline-block rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold tracking-widest text-cyan-300 uppercase">
          Console Access Verification
        </div>
        <h1 className="mt-3 text-2xl font-black text-white">Verify your email</h1>
        <p className="mt-2 text-sm leading-6 text-blue-100/70">
          Owner account requires verified email. Check your inbox ({email || "your account"}) for
          the verification code or resend it to open the console.
        </p>
        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-blue-200">
            Verification Code
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setRecoveryCode("");
              }}
              placeholder="000000"
              className="mt-2 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] text-white outline-none focus:border-cyan-300"
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-3 font-extrabold text-[#031039] transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Verify & Enter Dashboard"}
          </button>
        </form>
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleSendCode}
            disabled={busy}
            className="text-sm font-semibold text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
          >
            Send new code
          </button>
          {resendStatus && <p className="text-xs text-cyan-200 text-center">{resendStatus}</p>}
          {message && <p className="text-xs text-rose-300 text-center">{message}</p>}
        </div>
      </div>
    </div>
  );
}

function AccessPasswordSetupView() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070E22] px-4 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-amber-400/30 bg-[#0A1128] p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="h-10 w-auto" />
        </div>
        <div className="inline-block rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold tracking-widest text-amber-400 uppercase">
          Setup Required — Owner Security
        </div>
        <h1 className="mt-3 text-2xl font-black text-white">
          Set Your Zillionaire Access Password
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          The Zillionaire control centre is protected by a second-factor access password. To enter
          the dashboard, configure the following secret in your environment:
        </p>
        <div className="mt-4 rounded-xl border border-white/10 bg-[#030718] p-4 font-mono text-sm text-cyan-300">
          ZILLIONAIRE_ACCESS_PASSWORD=&lt;your-secure-password&gt;
        </div>
        <p className="mt-4 text-xs text-slate-400 leading-relaxed">
          Once the secret is saved, refresh this page to enter your access password and unlock the
          dashboard. The dashboard remains securely locked until this secret is configured.
        </p>
      </div>
    </div>
  );
}

function OwnerMfaSetupView({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("Enable mandatory owner authenticator verification");
  const [secret, setSecret] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(action: "ENROLL" | "CONFIRM") {
    setBusy(true);
    setMessage("");
    try {
      const headers = await getWebAuthHeaders(token);
      const body = action === "ENROLL" ? { action, password, reason } : { action, code, reason };
      const res = await fetch("/api/public/v1/zillionaire/access/mfa", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        secret?: string;
        otpauthUrl?: string;
        recoveryCodes?: string[];
        error?: string;
      };
      if (!res.ok) {
        setMessage(data.error || "Could not update authenticator setup.");
        return;
      }
      if (action === "ENROLL") setSecret(data.secret || "");
      else setRecoveryCodes(data.recoveryCodes || []);
    } catch {
      setMessage("Network error during authenticator setup.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070E22] px-4 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-cyan-500/20 bg-[#0A1128] p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="h-10 w-auto" />
        </div>
        <p className="text-xs uppercase tracking-widest text-cyan-300">Owner sign-in protection</p>
        <h1 className="mt-3 text-2xl font-black">Set up an authenticator</h1>
        <p className="mt-2 text-sm text-slate-300">
          The owner password alone is no longer enough. Add this account to an authenticator app,
          confirm a current code, then store the one-time recovery codes safely.
        </p>
        {recoveryCodes.length ? (
          <div className="mt-5 rounded-xl bg-slate-900 p-4">
            <p className="font-bold">
              Save these recovery codes now. They will not be shown again.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
              {recoveryCodes.map((item) => (
                <code key={item}>{item}</code>
              ))}
            </div>
            <button
              className="mt-5 w-full rounded-xl bg-cyan-400 p-3 font-bold text-slate-950"
              onClick={() => window.location.reload()}
            >
              I saved the codes, continue
            </button>
          </div>
        ) : !secret ? (
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send("ENROLL");
            }}
          >
            <label className="block text-sm">
              Owner access password
              <input
                className="mt-1 w-full rounded-lg bg-slate-950 p-3"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              Reason for this security change
              <input
                className="mt-1 w-full rounded-lg bg-slate-950 p-3"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </label>
            <button
              disabled={busy}
              className="w-full rounded-xl bg-cyan-400 p-3 font-bold text-slate-950"
            >
              {busy ? "Preparing…" : "Begin authenticator setup"}
            </button>
          </form>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-sm">Enter this setup key manually in your authenticator app:</p>
            <code className="block break-all rounded-xl bg-slate-950 p-4 text-cyan-200">
              {secret}
            </code>
            <label className="block text-sm">
              Six-digit code
              <input
                inputMode="numeric"
                maxLength={6}
                className="mt-1 w-full rounded-lg bg-slate-950 p-3 text-center font-mono text-xl"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
            <button
              disabled={busy || code.length !== 6}
              onClick={() => void send("CONFIRM")}
              className="w-full rounded-xl bg-cyan-400 p-3 font-bold text-slate-950"
            >
              Verify and enable
            </button>
          </div>
        )}
        {message && <p className="mt-4 text-sm text-rose-300">{message}</p>}
      </div>
    </div>
  );
}

function AccessPasswordUnlockView({
  token,
  mfaEnabled,
  onUnlocked,
  initialLockedOut,
  initialRemainingSeconds,
}: {
  token: string;
  mfaEnabled?: boolean;
  onUnlocked: () => void;
  initialLockedOut?: boolean | undefined;
  initialRemainingSeconds?: number | undefined;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [lockedOut, setLockedOut] = useState(Boolean(initialLockedOut));
  const [remainingSec, setRemainingSec] = useState(initialRemainingSeconds || 0);

  useEffect(() => {
    if (!lockedOut || remainingSec <= 0) return;
    const interval = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          setLockedOut(false);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedOut, remainingSec]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || lockedOut) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/access/unlock", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          password: password.trim(),
          ...(mfaEnabled && recoveryCode.trim() ? { recoveryCode: recoveryCode.trim() } : {}),
          ...(mfaEnabled && !recoveryCode.trim() && code.trim() ? { code: code.trim() } : {}),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        code?: string;
        error?: string;
        remainingLockSeconds?: number;
      };

      if (res.status === 200 && data.ok) {
        onUnlocked();
      } else if (res.status === 429) {
        setLockedOut(true);
        setRemainingSec(data.remainingLockSeconds || 900);
        setErrorMsg("Too many failed attempts. Dashboard locked for 15 minutes.");
      } else {
        setErrorMsg(data.error || "Incorrect access password.");
      }
    } catch {
      setErrorMsg("Network error during unlock request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070E22] px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-cyan-500/20 bg-[#0A1128] p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="h-10 w-auto" />
        </div>
        <div className="inline-block rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold tracking-widest text-cyan-300 uppercase">
          Zillionaire Control Centre
        </div>
        <h1 className="mt-3 text-2xl font-black text-white">Enter your access password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Enter your owner access password to unlock the Zillionaire dashboard.
        </p>

        {lockedOut ? (
          <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-rose-200 text-sm">
            <p className="font-bold">Dashboard locked for security</p>
            <p className="mt-1 text-xs text-rose-300">
              5 failed attempts reached. Try again in {Math.floor(remainingSec / 60)}m{" "}
              {remainingSec % 60}s.
            </p>
          </div>
        ) : (
          <form onSubmit={handleUnlock} className="mt-6 space-y-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Access Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mt-2 w-full rounded-xl border border-white/15 bg-[#030718] px-4 py-3 text-white outline-none focus:border-cyan-400 font-mono"
                required
              />
            </label>
            {mfaEnabled && (
              <>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Authenticator Code
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="mt-2 w-full rounded-xl border border-white/15 bg-[#030718] px-4 py-3 text-center font-mono text-white outline-none focus:border-cyan-400"
                    required
                  />
                </label>
                <details className="rounded-xl border border-white/10 p-3 text-sm text-slate-300">
                  <summary className="cursor-pointer">Use a recovery code instead</summary>
                  <input
                    aria-label="One-time recovery code"
                    autoComplete="off"
                    className="mt-3 w-full rounded-lg bg-[#030718] p-3 font-mono text-white"
                    value={recoveryCode}
                    onChange={(e) => {
                      setRecoveryCode(e.target.value);
                      if (e.target.value) setCode("");
                    }}
                    placeholder="Enter an unused recovery code"
                  />
                </details>
              </>
            )}
            <button
              type="submit"
              disabled={busy || !password.trim() || (Boolean(mfaEnabled) && !recoveryCode.trim() && code.length !== 6)}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 font-extrabold text-[#030718] transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Unlock Dashboard"}
            </button>
            {errorMsg && <p className="text-xs text-rose-400 text-center">{errorMsg}</p>}
          </form>
        )}
      </div>
    </div>
  );
}


function ConsoleAuthPortal({
  role,
  currentAccount,
}: {
  role: ConsoleRole;
  currentAccount?: ConsoleAccount;
}) {
  const [tab, setTab] = useState<"signin" | "register" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const consoleTitle = role === "producer" ? "Producer Console" : "Provider Console";

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await signInWithEmailPassword(email.trim(), password);
      window.location.reload();
    } catch (err: any) {
      setError(err?.message || "Invalid console credentials. Please check your email and password.");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      if (role === "provider") {
        // Provider accounts require pre-approved email
        const res = await fetch("/api/public/v1/provider/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim() || email.split("@")[0],
            contactEmail: email.trim(),
            settlementCurrency: currency,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || "Access denied. Contact tv@bqsqwad.com");
        }
      }

      await createAccountWithEmailPassword(email.trim(), password);
      setSuccess("Account created successfully. Loading your console...");
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      setError(err?.message || "Registration failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await sendPasswordResetEmail(email.trim());
      setSuccess("Password reset instructions have been sent to your email.");
    } catch (err: any) {
      setError(err?.message || "Failed to send reset email.");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOutWeb();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070e22] px-4 py-12 text-white">
      <div className="w-full max-w-md rounded-3xl border border-cyan-500/20 bg-[#0a1435] p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="h-10 w-auto" />
        </div>

        <div className="text-center">
          <span className="inline-block rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold tracking-widest text-cyan-300 uppercase">
            {consoleTitle}
          </span>
          <h1 className="mt-3 text-2xl font-black">{consoleTitle} Access</h1>
          <p className="mt-2 text-xs text-blue-100/70">
            Dedicated creator & partner management. Viewer sessions cannot open management consoles.
          </p>
        </div>

        {currentAccount && (
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-200 text-center">
            Signed in as <strong>{currentAccount.email}</strong> (Viewer role).
            <button
              onClick={handleSignOut}
              disabled={busy}
              className="mt-2 block w-full rounded-lg bg-amber-400/20 py-1.5 font-bold hover:bg-amber-400/30"
            >
              Sign Out & Switch to Console Account
            </button>
          </div>
        )}

        <div className="mt-6 flex border-b border-white/10 text-sm font-semibold">
          <button
            onClick={() => { setTab("signin"); setError(""); setSuccess(""); }}
            className={`flex-1 pb-3 text-center transition ${tab === "signin" ? "border-b-2 border-cyan-400 text-cyan-300" : "text-blue-200/60 hover:text-white"}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setTab("register"); setError(""); setSuccess(""); }}
            className={`flex-1 pb-3 text-center transition ${tab === "register" ? "border-b-2 border-cyan-400 text-cyan-300" : "text-blue-200/60 hover:text-white"}`}
          >
            Create Account
          </button>
          <button
            onClick={() => { setTab("reset"); setError(""); setSuccess(""); }}
            className={`flex-1 pb-3 text-center transition ${tab === "reset" ? "border-b-2 border-cyan-400 text-cyan-300" : "text-blue-200/60 hover:text-white"}`}
          >
            Reset
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/15 p-3 text-xs text-rose-300 text-center">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-3 text-xs text-emerald-300 text-center">
            {success}
          </div>
        )}

        {tab === "signin" && (
          <form onSubmit={handleSignIn} className="mt-6 space-y-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-blue-200">
              Console Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@example.com"
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-blue-200">
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-3 font-extrabold text-[#030718] transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign In to Console"}
            </button>
          </form>
        )}

        {tab === "register" && (
          <form onSubmit={handleRegister} className="mt-6 space-y-4">
            {role === "provider" && (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-200">
                Provider registrations are restricted to pre-approved partner email addresses.
              </div>
            )}
            <label className="block text-xs font-bold uppercase tracking-wider text-blue-200">
              {role === "producer" ? "Brand or Studio Name" : "Provider Entity Name"}
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={role === "producer" ? "Apex Studios" : "Global Distribution Ltd"}
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-blue-200">
              Email Address
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@example.com"
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-blue-200">
              Password
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300"
              />
            </label>
            {role === "provider" && (
              <label className="block text-xs font-bold uppercase tracking-wider text-blue-200">
                Settlement Currency
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300"
                >
                  <option value="NGN">NGN - Nigerian Naira</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="GBP">GBP - British Pound</option>
                </select>
              </label>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-3 font-extrabold text-[#030718] transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Registering…" : "Register Console Account"}
            </button>
          </form>
        )}

        {tab === "reset" && (
          <form onSubmit={handleReset} className="mt-6 space-y-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-blue-200">
              Console Account Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@example.com"
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#030b2a] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-3 font-extrabold text-[#030718] transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send Reset Email"}
            </button>
          </form>
        )}

        <div className="mt-8 border-t border-white/10 pt-4 text-center">
          <button
            onClick={async () => {
              if (window.confirm("Sign out of all sessions across all devices?")) {
                await fetch("/api/public/v1/auth/devices/signout-all", { method: "POST" }).catch(() => undefined);
                await signOutWeb();
                window.location.reload();
              }
            }}
            className="text-xs text-blue-200/50 hover:text-rose-300"
          >
            Security Emergency: Sign out everywhere
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConsolePageGuard({
  role,
  module: requiredModule,
  children,
}: ConsolePageGuardProps) {
  const [state, setState] = useState<
    | { status: "checking" }
    | { status: "denied"; token?: string; account?: ConsoleAccount }
    | { status: "unverified_owner"; token: string; email: string }
    | { status: "setup_required" }
    | { status: "mfa_setup"; token: string }
    | {
        status: "locked";
        token: string;
        mfaEnabled?: boolean;
        lockedOut: boolean;
        remainingLockSeconds?: number | undefined;
      }
    | { status: "authorized"; token: string; account: ConsoleAccount }
  >({ status: "checking" });

  const isZillionaireRoute = role === "admin" || role === "zillionaire";

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const token = await restoreWebSession();
        if (!token) {
          if (active) setState({ status: "denied" });
          return;
        }

        const headers = await getWebAuthHeaders(token);
        const response = await fetch("/api/public/v1/auth/web/me", {
          headers,
          cache: "no-store",
        });

        if (!response.ok) {
          if (active) setState({ status: "denied" });
          return;
        }

        const account = (await response.json()) as ConsoleAccount;
        let authorized = false;

        if (isZillionaireRoute) {
          if (account.isOwner) {
            // Check password unlock status
            const statusRes = await fetch("/api/public/v1/zillionaire/access/status", {
              headers,
              cache: "no-store",
            });
            if (statusRes.ok) {
              const statusData = (await statusRes.json()) as {
                configured: boolean;
                unlocked: boolean;
                lockedOut: boolean;
                mfaEnabled?: boolean;
                remainingLockSeconds?: number;
              };
              if (!statusData.configured) {
                if (active) setState({ status: "setup_required" });
                return;
              }
              if (!statusData.unlocked) {
                if (active)
                  setState({
                    status: "locked",
                    token,
                    mfaEnabled: Boolean(statusData.mfaEnabled),
                    lockedOut: statusData.lockedOut,
                    remainingLockSeconds: statusData.remainingLockSeconds,
                  });
                return;
              }
            }
            authorized = true;
          } else if (account.needsOwnerVerification) {
            if (active) setState({ status: "unverified_owner", token, email: account.email || "" });
            return;
          } else if (Array.isArray(account.modules) && account.modules.length > 0) {
            if (requiredModule) {
              authorized = account.modules.includes(requiredModule);
            } else {
              authorized = true;
            }
          }
        } else if (role === "producer") {
          authorized = Boolean(
            account.isOwner ||
            (Array.isArray(account.roles) &&
              account.roles.includes("producer") &&
              account.producerPlanActive !== false),
          );
        } else if (role === "provider") {
          authorized = Boolean(
            account.isOwner ||
            (Array.isArray(account.roles) &&
              account.roles.includes("provider") &&
              Boolean(account.providerId)),
          );
        }

        if (active) {
          setState(authorized ? { status: "authorized", token, account } : { status: "denied", token, account });
        }
      } catch {
        if (active) setState({ status: "denied" });
      }
    })();

    return () => {
      active = false;
    };
  }, [role, requiredModule, isZillionaireRoute]);

  useEffect(() => {
    if (state.status !== "authorized" || !state.account.isOwner || !isZillionaireRoute) return;
    let idleTimer: ReturnType<typeof setTimeout>;
    const lockForInactivity = () => {
      window.location.reload();
    };
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(lockForInactivity, 15 * 60 * 1000);
    };
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "mousemove",
      "touchstart",
      "wheel",
    ];
    events.forEach((event) => window.addEventListener(event, resetIdle, { passive: true }));
    resetIdle();
    const absoluteTimer = setTimeout(lockForInactivity, 8 * 60 * 60 * 1000);
    return () => {
      clearTimeout(idleTimer);
      clearTimeout(absoluteTimer);
      events.forEach((event) => window.removeEventListener(event, resetIdle));
    };
  }, [state, isZillionaireRoute]);

  const handleLock = async () => {
    try {
      if (state.status === "authorized") {
        const headers = await getWebAuthHeaders(state.token);
        await fetch("/api/public/v1/zillionaire/access/lock", {
          method: "POST",
          headers,
        });
      }
    } finally {
      window.location.reload();
    }
  };

  if (state.status === "checking") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background"
        aria-busy="true"
        data-testid="console-loading-shell"
      >
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (state.status === "unverified_owner") {
    return <OwnerVerificationView token={state.token} email={state.email} />;
  }

  if (state.status === "setup_required") {
    return <AccessPasswordSetupView />;
  }

  if (state.status === "mfa_setup") {
    return <OwnerMfaSetupView token={state.token} />;
  }

  if (state.status === "locked") {
    return (
      <AccessPasswordUnlockView
        token={state.token}
        mfaEnabled={state.mfaEnabled}
        onUnlocked={() => window.location.reload()}
        initialLockedOut={state.lockedOut}
        initialRemainingSeconds={state.remainingLockSeconds}
      />
    );
  }

  if (state.status === "denied") {
    if (isZillionaireRoute) {
      return <NotFoundView />;
    }
    return <ConsoleAuthPortal role={role} currentAccount={state.account} />;
  }

  return (
    <>

      {typeof children === "function"
        ? children({ token: state.token, account: state.account, onLock: handleLock })
        : children}
    </>
  );
}
