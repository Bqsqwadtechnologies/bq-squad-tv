import { useEffect, useState, type ReactNode } from "react";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { restoreWebSession, signInWithGoogleCredential, getWebAuthHeaders, signInWithEmailPassword, createAccountWithEmailPassword, sendPasswordResetEmail, signOutWeb } from "@/lib/firebase-web-auth";
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



function NeutralSignInPortal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setError("");
    try {
      await signInWithEmailPassword(email.trim(), password);
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid sign-in credentials.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070e22] px-4 py-12 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0a1435] p-8 shadow-2xl">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white">Sign in to continue</h1>
          <p className="mt-2 text-xs text-blue-100/70">
            Please enter your credentials to access this area.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/15 p-3 text-xs text-rose-300 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSignIn} className="mt-6 space-y-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-blue-200">
            Email Address
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
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
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className="mt-6 border-t border-white/10 pt-4 text-center">
          <a href="/" className="text-xs text-blue-200/60 hover:text-white transition">
            Return to Home
          </a>
        </div>
      </div>
    </div>
  );
}

function ProviderAccessDeniedView() {
  const [busy, setBusy] = useState(false);
  const [showEnquiry, setShowEnquiry] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [formData, setFormData] = useState({
    companyName: "",
    companyEmail: "",
    country: "",
    phone: "",
    representative: "",
    website: "",
    description: "",
    expectedChannels: "",
    licencesHeld: "",
  });

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOutWeb();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const handleEnquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormBusy(true);
    setFormError("");
    try {
      const res = await fetch("/api/public/v1/partner/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to submit partner enquiry.");
      }
      setSubmitted(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to submit partner enquiry.");
    } finally {
      setFormBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070e22] px-4 py-12 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-indigo-500/20 bg-[#0a1435] p-8 text-center shadow-2xl">
        <div className="flex justify-center mb-6">
          <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="h-10 w-auto" />
        </div>
        <span className="inline-block rounded-full bg-indigo-500/10 border border-indigo-400/20 px-3.5 py-1 text-xs font-bold tracking-widest text-indigo-300 uppercase">
          Partner Area
        </span>
        <h1 className="mt-4 text-xl font-bold text-white">Partner Access by Assignment Only</h1>
        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          Channels are created by us for approved partners. To partner with us, contact{" "}
          <a href="mailto:tv@bqsqwad.com" className="font-semibold text-cyan-300 underline underline-offset-2 hover:text-cyan-200">
            tv@bqsqwad.com
          </a>
          .
        </p>

        {submitted ? (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-left">
            <h3 className="font-bold text-emerald-300">Request received</h3>
            <p className="mt-1 text-xs text-emerald-100/90 leading-relaxed">
              We have received your partner enquiry. Our team will review your organisation details and notify you at your corporate email address.
            </p>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setShowEnquiry(false);
              }}
              className="mt-4 w-full rounded-xl bg-emerald-500/20 border border-emerald-500/40 py-2.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 transition"
            >
              Close
            </button>
          </div>
        ) : showEnquiry ? (
          <form onSubmit={handleEnquirySubmit} className="mt-6 text-left space-y-4">
            <div className="border-t border-white/10 pt-4">
              <h3 className="text-sm font-bold text-cyan-300 mb-3">Partner Enquiry</h3>
            </div>
            {formError ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {formError}
              </div>
            ) : null}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Company Name *</label>
              <input
                type="text"
                required
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                placeholder="Acme Broadcasting Ltd"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Corporate Email * (No free-mail)</label>
              <input
                type="email"
                required
                value={formData.companyEmail}
                onChange={(e) => setFormData({ ...formData, companyEmail: e.target.value })}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                placeholder="licensing@acmebroadcasting.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Country *</label>
                <input
                  type="text"
                  required
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                  placeholder="United Kingdom"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                  placeholder="+44 20 7946 0991"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Representative Name & Title *</label>
              <input
                type="text"
                required
                value={formData.representative}
                onChange={(e) => setFormData({ ...formData, representative: e.target.value })}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                placeholder="Jane Doe, Head of Distribution"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Corporate Website</label>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                placeholder="https://acmebroadcasting.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Description & Content Scope *</label>
              <textarea
                required
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                placeholder="Describe your linear channels, live events, or regional rights held..."
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEnquiry(false)}
                className="w-1/2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/10 transition"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={formBusy}
                className="w-1/2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-2.5 text-xs font-bold text-[#031039] hover:brightness-110 transition disabled:opacity-50"
              >
                {formBusy ? "Submitting…" : "Send Enquiry"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setShowEnquiry(true)}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-2.5 text-xs font-bold text-[#031039] hover:brightness-110 transition shadow-lg shadow-cyan-500/20"
            >
              Submit Partner Enquiry
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={busy}
              className="w-full rounded-xl bg-rose-500/20 border border-rose-500/40 py-2.5 text-xs font-bold text-rose-200 hover:bg-rose-500/30 transition disabled:opacity-50"
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
            <a
              href="/"
              className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 text-xs font-bold text-white hover:bg-white/10 transition block text-center"
            >
              Return to Home
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function ProducerAccessDeniedView() {
  const [busy, setBusy] = useState(false);
  const [showPortal, setShowPortal] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOutWeb();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  if (showPortal) {
    return <ConsoleAuthPortal role="producer" initialTab="register" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070e22] px-4 py-12 text-white">
      <div className="w-full max-w-md rounded-3xl border border-cyan-500/20 bg-[#0a1435] p-8 text-center shadow-2xl">
        <div className="flex justify-center mb-6">
          <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="h-10 w-auto" />
        </div>
        <span className="inline-block rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold tracking-widest text-cyan-300 uppercase">
          Producer Console
        </span>
        <h1 className="mt-4 text-xl font-bold text-white">Create your producer account</h1>
        <p className="mt-3 text-xs text-blue-100/70 leading-relaxed">
          You are currently signed in as a viewer. A producer account is required to access the Producer Console.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowPortal(true)}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-3 text-xs font-extrabold text-[#030718] transition hover:brightness-110"
          >
            Create Producer Account
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 text-xs font-bold text-white hover:bg-white/10 transition"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
          <a
            href="/"
            className="text-xs text-blue-200/60 hover:text-white transition"
          >
            Return to Home
          </a>
        </div>
      </div>
    </div>
  );
}

function ConsoleAuthPortal({
  role,
  currentAccount,
  initialTab,
}: {
  role: ConsoleRole;
  currentAccount?: ConsoleAccount;
  initialTab?: "signin" | "register" | "reset";
}) {
  const [tab, setTab] = useState<"signin" | "register" | "reset">(initialTab || "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const consoleTitle = role === "producer" ? "Producer Console" : "Provider Console";

  const handleGoogleCredential = async (credential: string) => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await signInWithGoogleCredential(credential);
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in could not be completed.");
    } finally {
      setBusy(false);
    }
  };


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
          <h1 className="mt-3 text-2xl font-black">{role === "producer" ? "Producer Console Sign In" : "Provider Console Sign In"}</h1>
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
    | { status: "signed_out" }
    | { status: "denied"; token: string; account: ConsoleAccount }
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
          if (active) setState({ status: "signed_out" });
          return;
        }

        const headers = await getWebAuthHeaders(token);
        const response = await fetch("/api/public/v1/auth/web/me", {
          headers,
          cache: "no-store",
        });

        if (!response.ok) {
          if (active) setState({ status: "signed_out" });
          return;
        }

        const account = (await response.json()) as ConsoleAccount;
        let authorized = false;

        if (isZillionaireRoute) {
          if (account.isOwner) {
            const statusRes = await fetch("/api/public/v1/zillionaire/access/status", {
              headers,
              cache: "no-store",
            });
            if (!statusRes.ok) {
              // Fail closed: an unavailable owner-security endpoint must never unlock
              // the Zillionaire console.
              if (active) setState({ status: "denied", token, account });
              return;
            }
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
            (account.emailVerified === true &&
              Array.isArray(account.roles) &&
              account.roles.includes("producer") &&
              account.producerPlanActive === true),
          );
        } else if (role === "provider") {
          authorized = Boolean(
            account.isOwner ||
            (account.emailVerified === true &&
              Array.isArray(account.roles) &&
              account.roles.includes("provider") &&
              Boolean(account.providerId)),
          );
        }

        if (active) {
          setState(
            authorized
              ? { status: "authorized", token, account }
              : { status: "denied", token, account },
          );
        }
      } catch {
        if (active) setState({ status: "signed_out" });
      }
    })();

    return () => {
      active = false;
    };
  }, [role, requiredModule, isZillionaireRoute]);

  const handleLock = async () => {
    try {
      const token = await restoreWebSession();
      if (token) {
        const headers = await getWebAuthHeaders(token);
        await fetch("/api/public/v1/zillionaire/access/lock", {
          method: "POST",
          headers,
        });
      }
    } catch {
      // Best-effort
    }
    window.location.reload();
  };

  if (state.status === "checking") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-[#070e22]"
        aria-busy="true"
        data-testid="console-loading-shell"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <span className="text-xs text-blue-200/60 font-medium">Loading session…</span>
        </div>
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
        mfaEnabled={state.mfaEnabled ?? false}
        onUnlocked={() => window.location.reload()}
        initialLockedOut={state.lockedOut}
        initialRemainingSeconds={state.remainingLockSeconds}
      />
    );
  }

  if (state.status === "signed_out") {
    if (isZillionaireRoute) {
      return <NeutralSignInPortal />;
    }
    return <ConsoleAuthPortal role={role} />;
  }

  if (state.status === "denied") {
    if (isZillionaireRoute) {
      const isDelegate =
        state.account.isOwner ||
        (Array.isArray(state.account.modules) && state.account.modules.length > 0);
      if (isDelegate) {
        return (
          <div className="flex min-h-screen items-center justify-center bg-[#070e22] px-4 text-white">
            <div className="w-full max-w-md rounded-3xl border border-amber-500/20 bg-[#0a1435] p-8 text-center shadow-2xl">
              <h1 className="text-xl font-black text-amber-300">You do not have access to this section</h1>
              <p className="mt-3 text-xs text-blue-100/70 leading-relaxed">
                Your account does not hold the permissions required for this specific module ({requiredModule || "restricted"}). Please contact the platform owner to request access.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <a
                  href="/zillionaire"
                  className="rounded-xl bg-cyan-400 py-2.5 text-xs font-bold text-slate-950 transition hover:brightness-110"
                >
                  Return to Dashboard
                </a>
                <a
                  href="/"
                  className="rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-white transition hover:bg-white/10"
                >
                  Return to Home
                </a>
              </div>
            </div>
          </div>
        );
      }
      return <NotFoundView />;
    }
    if (role === "provider") {
      return <ProviderAccessDeniedView />;
    }
    return <ProducerAccessDeniedView />;
  }

  return (
    <>
      {typeof children === "function"
        ? children({ token: state.token, account: state.account, onLock: handleLock })
        : children}
    </>
  );
}
