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

type PlatformFlags = {
  producerChannelCreation: boolean; waitingRoom: boolean; maintenanceMode: boolean; signupsOpen: boolean;
  commentsOpen: boolean; newStreamGrants: boolean; adultChannels: boolean; liveTv: boolean;
  providerConsole: boolean; hlsEncryption: boolean; forYou: boolean; reminders: boolean;
};

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
  { id: "system", title: "Data structure", description: "Review the platform data structure without viewing private record contents.", href: "/admin/firebase-schema", icon: Settings2 },
  { id: "system", title: "Storage locations", description: "Review available storage locations, their status and where new files are placed.", href: "/admin/storage", icon: Database },
  { id: "channels", title: "Channel operations", description: "The tools are in place; the management screen is still being completed.", icon: Tv2 },
  { id: "content", title: "Content & rights", description: "Rights evidence, review state, publishing and featured-content controls.", href: "/admin/video-studio", icon: Film },
  { id: "users", title: "Viewer accounts", description: "Account status and access controls.", icon: Users },
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
      { name: "robots", content: "noindex, nofollow, noarchive" },
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
  const [platformFlags, setPlatformFlags] = useState<PlatformFlags | null>(null);
  const [flagsReason, setFlagsReason] = useState("");
  const [flagsBusy, setFlagsBusy] = useState(false);
  const [flagsMessage, setFlagsMessage] = useState("");
  const [flagsError, setFlagsError] = useState("");
  const [legalSeedBusy, setLegalSeedBusy] = useState(false);
  const [legalSeedMessage, setLegalSeedMessage] = useState("");
  const [legalSeedError, setLegalSeedError] = useState("");

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
    if (result.owner) {
      const flagsResponse = await fetch("/api/public/v1/admin/config/flags", {
        headers: await getWebAuthHeaders(idToken),
        cache: "no-store",
      });
      const flagsData = await flagsResponse.json() as { flags?: PlatformFlags; error?: string };
      if (!flagsResponse.ok || !flagsData.flags) throw new Error(flagsData.error ?? "Could not load platform controls.");
      setPlatformFlags(flagsData.flags);
    }
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

  async function loadDefaultLegalPages() {
    setLegalSeedBusy(true); setLegalSeedMessage(""); setLegalSeedError("");
    try {
      const token = await restoreWebSession();
      if (!token) throw new Error("Sign in again to continue.");
      const response = await fetch("/api/public/v1/admin/pages/seed", {
        method: "POST", headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({ reason: "Load the original legal draft pages for owner review." }),
      });
      const result = await response.json() as { created?: string[]; skipped?: string[]; error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not load the draft pages.");
      setLegalSeedMessage("Created: " + (result.created?.join(", ") || "none") + ". Left unchanged: " + (result.skipped?.join(", ") || "none") + ". " + (result.message ?? ""));
    } catch (caught) { setLegalSeedError(caught instanceof Error ? caught.message : "Could not load the draft pages."); }
    finally { setLegalSeedBusy(false); }
  }

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

  async function savePlatformFlags(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!platformFlags || !access?.owner || flagsBusy || flagsReason.trim().length < 3) return;
    setFlagsBusy(true);
    setFlagsError("");
    setFlagsMessage("");
    try {
      const token = await restoreWebSession();
      if (!token) throw new Error("Your secure session has expired. Sign in again.");
      const response = await fetch("/api/public/v1/admin/config/flags", {
        method: "PUT",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({ flags: platformFlags, reason: flagsReason.trim() }),
      });
      const result = await response.json() as { saved?: boolean; version?: number; error?: string };
      if (!response.ok || !result.saved) throw new Error(result.error ?? "Could not save platform controls.");
      setFlagsMessage("Platform controls saved as version " + result.version + ".");
      setFlagsReason("");
    } catch (caught) {
      setFlagsError(caught instanceof Error ? caught.message : "Could not save platform controls.");
    } finally {
      setFlagsBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030b2a] text-white">
      <header className="border-b border-cyan-300/15 bg-[#050f35]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5">
          <a href="/" aria-label="BQ SQWAD TV home">
            <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="w-44" />
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
            <h1 className="mt-4 text-3xl font-black sm:text-5xl">{access?.owner ? "Zillionaire Dashboard" : "Secure dashboard access"}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-blue-100/60">
              Manage BQ SQWAD TV through server-authorized modules. Access is checked against your account and permissions on every request.
            </p>
          </div>
          {access?.owner ? (
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">Access verified</p>
              <p className="mt-1 text-sm font-bold">{access.owner ? "Zillionaire Dashboard owner" : "Delegated operator"}</p>
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
                <p className="mt-1 text-xs leading-5 text-blue-100/55">Verified for this session; every request independently checks access.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5">
                <LockKeyhole className="text-cyan-200" size={22} />
                <p className="mt-4 text-sm font-bold">Dashboard protection</p>
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

            {access.owner ? (
              <section className="mt-10 rounded-3xl border border-cyan-300/20 bg-[#07143d] p-5 sm:p-7" aria-labelledby="legal-pages-heading">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Owner settings</p>
                <h2 id="legal-pages-heading" className="mt-1 text-2xl font-black">Legal pages and placeholders</h2>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-blue-100/60">Load the original documents as drafts only. Existing pages are never replaced. Publishing remains blocked until every placeholder is completed and the wording has been reviewed by a qualified lawyer in each country where we operate.</p>
                <button type="button" onClick={() => void loadDefaultLegalPages()} disabled={legalSeedBusy} className="mt-5 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-extrabold text-[#031039] disabled:opacity-50">{legalSeedBusy ? "Loading draft pages…" : "Load default pages"}</button>
                {legalSeedMessage ? <p role="status" className="mt-3 text-sm text-cyan-200">{legalSeedMessage}</p> : null}
                {legalSeedError ? <p role="alert" className="mt-3 text-sm text-rose-200">{legalSeedError}</p> : null}
                <h3 className="mt-7 text-sm font-bold">Placeholder list</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead><tr className="border-b border-white/10 text-cyan-200"><th className="py-2 pr-4">Placeholder</th><th className="py-2">What we need to fill in</th></tr></thead>
                    <tbody className="text-blue-100/70">
                      {[
                        ["{{effective_date}}, {{last_updated}}", "Effective and update dates"],
                        ["{{minimum_age}}", "Minimum account age after legal review"],
                        ["{{viewing_history_retention}}, {{evidence_retention}}, {{security_log_retention}}", "Retention periods"],
                        ["{{dispute_window_days}}", "Charge dispute period in days"],
                        ["{{wallet_refund_rule}}, {{closure_balance_rule}}", "Wallet refund and account-closure balance rules"],
                        ["{{liability_period_months}}", "Liability period in months"],
                        ["{{governing_law}}, {{jurisdiction}}", "Governing law and courts"],
                        ["{{postal_address_if_required}}", "Postal address if legally required"],
                        ["{{revenue_basis}}, {{revenue_change_notice_days}}, {{minimum_payout}}", "Producer revenue basis, notice period and minimum payout"],
                      ].map(([placeholder, explanation]) => <tr key={placeholder} className="border-b border-white/5"><td className="py-3 pr-4 font-mono">{placeholder}</td><td className="py-3">{explanation}</td></tr>)}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-xs leading-5 text-blue-100/55">Provider terms also need contract-specific revenue model and deductible-cost rules. Do not publish until all legal and operational details are accurate.</p>
              </section>
            ) : null}

            {access.owner ? (
              <section className="mt-10 rounded-3xl border border-cyan-300/20 bg-[#07143d] p-5 sm:p-7" aria-labelledby="platform-controls-heading">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Owner only</p><h2 id="platform-controls-heading" className="mt-1 text-2xl font-black">Platform feature controls</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-blue-100/55">Changes are saved through the protected server and recorded in the audit history. Keep features off until their provider setup and safety checks are complete.</p></div>
                  <span className="rounded-full border border-cyan-300/20 px-3 py-1 text-xs text-cyan-200">Zillionaire Dashboard access</span>
                </div>
                {platformFlags ? (
                  <form onSubmit={savePlatformFlags} className="mt-6">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {([
                        ["producerChannelCreation", "Producer channel creation", "Allow eligible producers to request channel creation."],
                        ["waitingRoom", "Waiting room", "Enable the waiting room experience."],
                        ["maintenanceMode", "Maintenance mode", "Show the platform maintenance state."],
                        ["signupsOpen", "New account registration", "Allow new viewers to create accounts."],
                        ["commentsOpen", "Viewer comments", "Allow comments where the content supports them."],
                        ["newStreamGrants", "New viewing sessions", "Allow new session grants."],
                        ["adultChannels", "Age-restricted channels", "Keep off unless age and rights controls are approved."],
                        ["liveTv", "Live TV", "Enable live TV surfaces after provider checks."],
                        ["providerConsole", "Provider console", "Keep off until provider access is configured."],
                        ["hlsEncryption", "Stream encryption", "Keep off until key delivery and playback are verified."],
                        ["forYou", "For You recommendations", "Enable personalized discovery surfaces."],
                        ["reminders", "Viewing reminders", "Enable reminder surfaces after delivery setup."],
                      ] as const).map(([key, title, description]) => (
                        <label key={key} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#030b2a] p-4">
                          <input type="checkbox" checked={platformFlags[key]} onChange={event => setPlatformFlags(current => current ? { ...current, [key]: event.target.checked } : current)} className="mt-1 size-4 accent-cyan-300" />
                          <span><span className="block text-sm font-bold">{title}</span><span className="mt-1 block text-xs leading-5 text-blue-100/50">{description}</span><span className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-cyan-200">{platformFlags[key] ? "Enabled" : "Disabled"}</span></span>
                        </label>
                      ))}
                    </div>
                    <label className="mt-5 grid gap-2 text-sm text-blue-100/70">Reason for this change
                      <textarea required minLength={3} maxLength={1000} value={flagsReason} onChange={event => setFlagsReason(event.target.value)} className="min-h-20 rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300" placeholder="Describe why these settings are changing." />
                    </label>
                    {flagsError ? <p role="alert" className="mt-3 text-sm text-rose-200">{flagsError}</p> : null}
                    {flagsMessage ? <p role="status" className="mt-3 text-sm text-cyan-200">{flagsMessage}</p> : null}
                    <button type="submit" disabled={flagsBusy || flagsReason.trim().length < 3} className="mt-4 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 text-sm font-extrabold text-[#031039] disabled:cursor-not-allowed disabled:opacity-50">{flagsBusy ? "Saving controls…" : "Save platform controls"}</button>
                  </form>
                ) : <p className="mt-5 text-sm text-blue-100/55">Loading owner controls…</p>}
              </section>
            ) : null}

            <div className="mt-10">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Permission-aware navigation</p>
                  <h2 className="mt-1 text-2xl font-black">Platform modules</h2>
                </div>
                <p className="text-xs text-blue-100/45">Only modules granted by the server are shown.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {moduleCards.filter(item => allowedModules.has(item.id) && (item.title !== "Storage locations" || access.owner)).map(item => {
                  const Icon = item.icon;
                  return (
                    <article key={item.title} className="rounded-2xl border border-white/10 bg-[#07143d] p-5 transition hover:border-cyan-300/30">
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200"><Icon size={20} /></span>
                        {item.href ? <a href={item.href} aria-label={"Open " + item.title} className="text-cyan-200 hover:text-white"><ArrowUpRight size={19} /></a> : <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100/35">Setup pending</span>}
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
