import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, Film, LoaderCircle, LogOut, Radio, Users, Wallet } from "lucide-react";
import { getWebAuthHeaders, restoreWebSession, signInWithEmailPassword } from "@/lib/firebase-web-auth";

type Summary = {
  producerStatus: string;
  earningsBalanceMinor: number;
  earningsLifetimeMinor: number;
  currency: string;
  channelCount: number;
  publishedChannelCount: number;
  channels: Array<{ id: string; title: string; status: string }>;
};

type Earnings = {
  statement: Array<{ id: string; kind: string; amountMinor: number; currency: string; createdAt: string | null }>;
  payouts: Array<{ id: string; amountMinor: number; currency: string; status: string; createdAt: string | null }>;
};

function money(value: number, currency: string) {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(value / (10 ** digits));
}

export const Route = createFileRoute("/producer/")({
  component: ProducerConsole,
  head: () => ({ meta: [
    { title: "Workspace | BQ SQWAD TV" },
    { name: "description", content: "Manage channels, team access and earnings." },
    { name: "robots", content: "noindex, nofollow, noarchive" },
  ] }),
});

function ProducerConsole() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(idToken: string) {
    const headers = await getWebAuthHeaders(idToken);
    const [summaryResponse, earningsResponse] = await Promise.all([
      fetch("/api/public/v1/producer/mobile-summary", { headers, cache: "no-store" }),
      fetch("/api/public/v1/producer/earnings", { headers, cache: "no-store" }),
    ]);
    const summaryResult = await summaryResponse.json() as Summary & { error?: string };
    const earningsResult = await earningsResponse.json() as Earnings & { error?: string };
    if (!summaryResponse.ok) throw new Error(summaryResult.error ?? "Producer access could not be verified.");
    if (!earningsResponse.ok) throw new Error(earningsResult.error ?? "Producer earnings could not be loaded.");
    setSummary(summaryResult);
    setEarnings(earningsResult);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const restored = await restoreWebSession();
        if (restored && active) {
          setToken(restored);
          await load(restored);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load Producer Console.");
      }
    })();
    return () => { active = false; };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signInWithEmailPassword(email, password);
      setEmail(result.email);
      setPassword("");
      setToken(result.idToken);
      await load(result.idToken);
    } catch (caught) {
      setPassword("");
      setError(caught instanceof Error ? caught.message : "Producer sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    setToken("");
    setSummary(null);
    setEarnings(null);
    setPassword("");
  }

  return (
    <main className="min-h-screen bg-[#030b2a] text-white">
      <header className="border-b border-cyan-300/15 bg-[#050f35]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <a href="/"><img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="w-40" /></a>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-200">Producer Console</span>
            {token ? <button onClick={signOut} className="rounded-lg border border-white/10 p-2 text-blue-100/70" aria-label="Sign out"><LogOut size={17} /></button> : null}
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Creator operations</p>
        <h1 className="mt-3 text-3xl font-black sm:text-5xl">Your production workspace</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-blue-100/60">Manage your channels, authorized team members, programming schedules and revenue statements. Your channel permissions and producer verification are checked by the server.</p>

        {!token ? (
          <form onSubmit={signIn} className="mt-8 grid max-w-md gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-6">
            <h2 className="text-xl font-bold">Producer sign in</h2>
            <label className="grid gap-2 text-sm text-blue-100/70">Email
              <input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">Password
              <input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" />
            </label>
            {error ? <p role="alert" className="text-sm text-rose-200">{error}</p> : null}
            <button disabled={busy} className="rounded-xl bg-cyan-300 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60">{busy ? "Signing in…" : "Open Producer Console"}</button>
          </form>
        ) : null}

        {token && !summary && !error ? <div className="mt-8 flex items-center gap-3 text-sm text-blue-100/60"><LoaderCircle className="animate-spin" /> Loading your workspace…</div> : null}
        {token && error ? <div role="alert" className="mt-8 rounded-2xl border border-rose-300/20 bg-rose-300/5 p-4 text-sm text-rose-200">{error}</div> : null}

        {summary ? <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-cyan-300/20 bg-[#07143d] p-5"><Wallet className="text-cyan-200" /><p className="mt-4 text-xs text-blue-100/50">Available earnings</p><p className="mt-1 text-2xl font-black">{money(summary.earningsBalanceMinor, summary.currency)}</p></div>
            <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><BadgeCheck className="text-cyan-200" /><p className="mt-4 text-xs text-blue-100/50">Lifetime earnings</p><p className="mt-1 text-2xl font-black">{money(summary.earningsLifetimeMinor, summary.currency)}</p></div>
            <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><Film className="text-cyan-200" /><p className="mt-4 text-xs text-blue-100/50">Channels</p><p className="mt-1 text-2xl font-black">{summary.channelCount}</p><p className="mt-1 text-xs text-blue-100/45">{summary.publishedChannelCount} published</p></div>
            <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><Radio className="text-cyan-200" /><p className="mt-4 text-xs text-blue-100/50">Producer status</p><p className="mt-1 text-lg font-black">{summary.producerStatus}</p></div>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
            <section className="rounded-3xl border border-white/10 bg-[#07143d] p-5 sm:p-7">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black">Your channels</h2><a href="/producer/channels" className="text-xs font-bold text-cyan-200">Manage channels →</a></div>
              {summary.channels.length ? <div className="mt-5 grid gap-3">{summary.channels.map(channel => <div key={channel.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#030b2a] p-4"><div className="min-w-0"><p className="truncate font-bold">{channel.title}</p><p className="mt-1 text-xs text-blue-100/45">{channel.id}</p></div><span className="shrink-0 rounded-full border border-cyan-300/20 px-3 py-1 text-[10px] font-bold text-cyan-200">{channel.status}</span></div>)}</div> : <p className="mt-5 text-sm text-blue-100/55">No channels are linked to this producer account yet.</p>}
            </section>
            <section className="rounded-3xl border border-white/10 bg-[#07143d] p-5 sm:p-7">
              <h2 className="text-xl font-black">Workspace tools</h2>
              <div className="mt-5 grid gap-3">
                <a href="/producer/channels" className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#030b2a] p-4"><Film className="text-cyan-200" /><span className="font-bold">Channels & content</span></a>
                <a href="/producer/channels" className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#030b2a] p-4"><Radio className="text-cyan-200" /><span className="font-bold">Programming schedules</span></a>
                <a href="/producer/channels" className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#030b2a] p-4"><Users className="text-cyan-200" /><span className="font-bold">Channel teams</span></a>
                <a href="#earnings" className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#030b2a] p-4"><Wallet className="text-cyan-200" /><span className="font-bold">Earnings & payout history</span></a>
              </div>
            </section>
          </div>
          <section id="earnings" className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-[#07143d] p-5 sm:p-7"><h2 className="text-xl font-black">Recent earnings statement</h2>{earnings?.statement.length ? <div className="mt-4 grid gap-3">{earnings.statement.slice(0, 10).map(row => <div key={row.id} className="flex items-center justify-between gap-3 border-b border-white/5 pb-3"><div><p className="text-sm font-bold">{row.kind.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-blue-100/45">{row.createdAt ?? "Date unavailable"}</p></div><p className="text-sm font-bold">{money(row.amountMinor, row.currency)}</p></div>)}</div> : <p className="mt-4 text-sm text-blue-100/50">No earning entries are available in the recent statement window.</p>}</div>
            <div className="rounded-3xl border border-white/10 bg-[#07143d] p-5 sm:p-7"><h2 className="text-xl font-black">Payout history</h2>{earnings?.payouts.length ? <div className="mt-4 grid gap-3">{earnings.payouts.slice(0, 10).map(row => <div key={row.id} className="flex items-center justify-between gap-3 border-b border-white/5 pb-3"><div><p className="text-sm font-bold">{row.status}</p><p className="mt-1 text-xs text-blue-100/45">{row.createdAt ?? "Date unavailable"}</p></div><p className="text-sm font-bold">{money(row.amountMinor, row.currency)}</p></div>)}</div> : <p className="mt-4 text-sm text-blue-100/50">No payout requests yet.</p>}</div>
          </section>
          <p className="mt-6 text-xs leading-6 text-blue-100/40">Live channel scheduling is available through channel schedules. Actual live ingest and delivery still require an authorized streaming-provider adapter; no provider is silently enabled by this console.</p>
        </> : null}
      </section>
    </main>
  );
}
