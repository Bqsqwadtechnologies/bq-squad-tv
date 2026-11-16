import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BadgeCheck,
  CircleAlert,
  Database,
  Film,
  Gauge,
  LockKeyhole,
  Megaphone,
  Settings2,
  ShieldCheck,
  Tv2,
  Users,
  Wallet,
} from "lucide-react";
import {
  getWebAuthHeaders,
  restoreWebSession,
  signInWithEmailPassword,
} from "@/lib/firebase-web-auth";

type AdminModule =
  | "overview" | "users" | "roles" | "producers" | "channels" | "content"
  | "pricing" | "wallets" | "payments" | "payouts" | "ads" | "notifications"
  | "moderation" | "security" | "system";

type Access = {
  controlCentre?: "ZILLIONAIRE";
  owner: boolean;
  emailVerified: boolean;
  producerPlanActive: boolean;
  modules: AdminModule[];
};

const moduleCards: Array<{
  id: AdminModule;
  title: string;
  description: string;
  href?: string;
  icon: typeof Gauge;
}> = [
  { id: "pricing", title: "Pricing & billing rules", description: "Versioned PAYG rates, wallet packages and Google Play products.", href: "/admin/pricing", icon: Wallet },
  { id: "ads", title: "Advertising providers", description: "Separate Android and website providers, placements and credentials.", href: "/admin/ads", icon: Megaphone },
  { id: "overview", title: "Monthly operations reports", description: "Review monthly ledger, payout, advertising and producer-review activity.", href: "/admin/reports", icon: Gauge },
  { id: "system", title: "Firebase schema inspector", description: "Inspect field names and types without exposing production document values.", href: "/admin/firebase-schema", icon: Settings2 },
  { id: "system", title: "Storage destinations", description: "Register Lovable Storage and Backblaze destinations, inspect secret configuration and manage routing metadata.", href: "/admin/storage", icon: Database },
  { id: "channels", title: "Channel operations", description: "Server APIs are present; the dedicated management screen is being completed.", icon: Tv2 },
  { id: "content", title: "Content & rights", description: "Rights evidence, review state, publishing and featured-content controls.", href: "/admin/video-studio", icon: Film },
  { id: "users", title: "Viewer accounts", description: "Account status and access administration.", icon: Users },
  { id: "producers", title: "Producer verification", description: "Review producer verification and channel ownership.", icon: BadgeCheck },
  { id: "wallets", title: "Wallet operations", description: "Wallet and ledger oversight with audited actions.", icon: Wallet },
  { id: "payments", title: "Payments & reversals", description: "Payment review and controlled reversal workflows.", icon: LockKeyhole },
  { id: "payouts", title: "Producer payouts", description: "Review, settle and audit producer payout requests.", icon: Wallet },
  { id: "moderation", title: "Community moderation", description: "Review viewer comments before public visibility.", icon: ShieldCheck },
  { id: "notifications", title: "Notifications", description: "Platform notices and delivery controls.", icon: Megaphone },
  { id: "security", title: "Security controls", description: "Session, device and integrity controls.", icon: LockKeyhole },
  { id: "roles", title: "Delegated access", description: "Least-privilege module permissions for delegated operators.", icon: Users },
];

export const Route = createFileRoute("/admin/")({
  component: ZillionaireDashboard,
  head: () => ({
    meta: [
      { title: "Dashboard | BQ SQWAD TV" },
      { name: "description", content: "Secure account access for BQ SQWAD TV." },
    ],
  }),
});

function ZillionaireDashboard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [access, setAccess] = useState<Access | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  async function loadAccess(idToken: string) {
    const response = await fetch("/api/public/v1/admin/overview", {
      headers: await getWebAuthHeaders(idToken),
      cache: "no-store",
    });
    const result = await response.json() as Access & { error?: string };
    if (!response.ok) {
      setAccess(null);
      throw new Error(result.error ?? (response.status === 403
        ? "This account does not have dashboard access."
        : "Could not verify control-centre access."));
    }
    setAccess(result);
    setError("");
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await restoreWebSession();
        if (token && active) await loadAccess(token);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not verify access.");
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signInWithEmailPassword(email, password);
      setEmail(result.email);
      setPassword("");
      await loadAccess(result.idToken);
    } catch (caught) {
      setPassword("");
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  const allowedModules = new Set(access?.modules ?? []);

  return (
    <main className="min-h-screen bg-[#030b2a] text-white">
      <header className="border-b border-cyan-300/15 bg-[#050f35]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5">
          <a href="/" aria-label="BQ SQWAD TV home">
            <img src="/brand/bq-sqwad-tv-logo.svg" alt="BQ SQWAD TV" className="w-44" />
          </a>
          {access?.owner ? (
            <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-cyan-200">
              ZILLIONAIRE
            </span>
          ) : null}
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:py-14">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
              <ShieldCheck size={16} /> Protected platform controls
            </p>
            <h1 className="mt-4 text-3xl font-black sm:text-5xl">{access?.owner ? "ZILLIONAIRE Control Centre" : "Secure dashboard access"}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-blue-100/60">
              Manage BQ SQWAD TV through server-authorized modules. Access is checked against the verified account and current Firestore permissions on every request.
            </p>
          </div>
          {access?.owner ? (
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">Access verified</p>
              <p className="mt-1 text-sm font-bold">{access.owner ? "Protected owner account" : "Delegated operator"}</p>
              <p className="mt-1 text-xs text-blue-100/50">{access.modules.length} authorized modules</p>
            </div>
          ) : null}
        </div>

        {checking ? (
          <div className="mt-9 rounded-3xl border border-white/10 bg-[#07143d] p-6 text-sm text-blue-100/60">Checking your secure session…</div>
        ) : null}

        {!checking && !access ? (
          <form onSubmit={login} className="mt-9 grid max-w-md gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-6">
            <div>
              <h2 className="text-xl font-bold">Verify platform access</h2>
              <p className="mt-2 text-sm leading-6 text-blue-100/55">Sign in with the configured owner account or an authorized delegated account. Email verification is required.</p>
            </div>
            <label className="grid gap-2 text-sm text-blue-100/70">
              Email address
              <input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300" />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">
              Password
              <input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300" />
            </label>
            {error ? <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-sm text-rose-200">{error}</p> : null}
            <button disabled={busy} className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60">
              {busy ? "Verifying access…" : "Sign in securely"}
            </button>
          </form>
        ) : null}

        {access ? (
          <>
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#0b286f] to-[#07143d] p-5">
                <Gauge className="text-cyan-200" size={22} />
                <p className="mt-4 text-sm font-bold">Server authorization</p>
                <p className="mt-1 text-xs leading-5 text-blue-100/55">Verified for this session; each API independently rechecks access.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5">
                <LockKeyhole className="text-cyan-200" size={22} />
                <p className="mt-4 text-sm font-bold">Owner protection</p>
                <p className="mt-1 text-xs leading-5 text-blue-100/55">{access.owner ? "Owner identity is anchored to the configured verified email." : "This account is limited to its delegated scopes."}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5">
                <ShieldCheck className="text-cyan-200" size={22} />
                <p className="mt-4 text-sm font-bold">Email verification</p>
                <p className="mt-1 text-xs leading-5 text-blue-100/55">{access.emailVerified ? "Verified email is confirmed by the server." : "Email verification is required for protected actions."}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5">
                <CircleAlert className="text-cyan-200" size={22} />
                <p className="mt-4 text-sm font-bold">Streaming readiness</p>
                <p className="mt-1 text-xs leading-5 text-blue-100/55">Provider setup remains separate from owner controls and requires approved rights and provider credentials.</p>
              </div>
            </div>

            <div className="mt-10">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Permission-aware navigation</p>
                  <h2 className="mt-1 text-2xl font-black">Platform modules</h2>
                </div>
                <p className="text-xs text-blue-100/45">Only modules granted by the server are shown.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {moduleCards.filter(item => allowedModules.has(item.id) && (item.title !== "Storage destinations" || access.owner)).map(item => {
                  const Icon = item.icon;
                  return (
                    <article key={item.title} className="rounded-2xl border border-white/10 bg-[#07143d] p-5 transition hover:border-cyan-300/30">
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200"><Icon size={20} /></span>
                        {item.href ? <a href={item.href} aria-label={"Open " + item.title} className="text-cyan-200 hover:text-white"><ArrowUpRight size={19} /></a> : <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100/35">API scope</span>}
                      </div>
                      <h3 className="mt-4 font-bold">{item.title}</h3>
                      <p className="mt-2 text-xs leading-5 text-blue-100/55">{item.description}</p>
                      {item.href ? <a href={item.href} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-cyan-200">Open module <ArrowUpRight size={14} /></a> : null}
                    </article>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
