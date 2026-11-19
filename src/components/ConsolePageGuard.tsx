import { useEffect, useState, type ReactNode } from "react";
import { restoreWebSession, getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { NotFoundView } from "@/components/NotFoundView";

export type ConsoleRole = "admin" | "producer" | "provider";

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
  children: ReactNode | ((props: { token: string; account: ConsoleAccount }) => ReactNode);
}

function OwnerVerificationView({ token, email }: { token: string; email: string }) {
  const [code, setCode] = useState("");
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
      const data = await res.json() as { sent?: boolean; alreadyVerified?: boolean; error?: string };
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
      const data = await res.json() as { verified?: boolean; error?: string };
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
          Zillionaire Security
        </div>
        <h1 className="mt-3 text-2xl font-black text-white">Verify your email</h1>
        <p className="mt-2 text-sm leading-6 text-blue-100/70">
          Owner account requires verified email. Check your inbox ({email || "your account"}) for the verification code or resend it to open the Zillionaire Dashboard.
        </p>
        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-blue-200">
            Verification Code
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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

export function ConsolePageGuard({ role, module: requiredModule, children }: ConsolePageGuardProps) {
  const [state, setState] = useState<
    | { status: "checking" }
    | { status: "denied" }
    | { status: "unverified_owner"; token: string; email: string }
    | { status: "authorized"; token: string; account: ConsoleAccount }
  >({ status: "checking" });

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

        if (role === "admin") {
          if (account.isOwner) {
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
            Array.isArray(account.roles) &&
            account.roles.includes("producer") &&
            account.producerPlanActive !== false
          );
        } else if (role === "provider") {
          authorized = Boolean(
            Array.isArray(account.roles) &&
            account.roles.includes("provider") &&
            Boolean(account.providerId)
          );
        }

        if (active) {
          setState(authorized ? { status: "authorized", token, account } : { status: "denied" });
        }
      } catch {
        if (active) setState({ status: "denied" });
      }
    })();

    return () => {
      active = false;
    };
  }, [role, requiredModule]);

  // 1. Tiny neutral shell while checking
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

  // 2. Denied: Plain "page not found" screen (same layout, status and text as an unknown address, no hint that a console exists)
  if (state.status === "denied") {
    return <NotFoundView />;
  }

  // 3. Authorized: render the console
  if (typeof children === "function") {
    return <>{children({ token: state.token, account: state.account })}</>;
  }

  return <>{children}</>;
}
