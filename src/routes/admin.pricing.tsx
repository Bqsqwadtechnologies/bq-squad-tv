import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { signInWithEmailPassword } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/admin/pricing")({
  component: AdminPricingPage,
  head: () => ({ meta: [{ title: "Pricing settings | BQ SQWAD TV" }] }),
});

type PricingConfig = {
  version?: number;
  defaultRatePerMinuteMinor: number;
  minimumSessionBalanceMinor: number;
  defaultProducerShareBps: number;
  maxConcurrentSessions?: number;
  walletTopups: Record<string, { amountMinor: number; creditMinor?: number }>;
  googlePlayProducts: Array<{ productId: string; title: string; description: string; credits: number; creditMinor: number; active: boolean }>;
};

function AdminPricingPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [rate, setRate] = useState("");
  const [minimum, setMinimum] = useState("");
  const [share, setShare] = useState("");
  const [sessionLimit, setSessionLimit] = useState("2");
  const [topups, setTopups] = useState("");
  const [products, setProducts] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadConfig(idToken: string) {
    const response = await fetch("/api/public/v1/admin/config/pricing", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (response.status === 404) return;
    const data = await response.json() as PricingConfig & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load pricing configuration.");
    setRate(String(data.defaultRatePerMinuteMinor));
    setMinimum(String(data.minimumSessionBalanceMinor));
    setShare(String(data.defaultProducerShareBps));
    setSessionLimit(String(data.maxConcurrentSessions ?? 2));
    setTopups(JSON.stringify(data.walletTopups ?? {}, null, 2));
    setProducts(JSON.stringify(data.googlePlayProducts ?? [], null, 2));
    setVersion(data.version ?? null);
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signInWithEmailPassword(email, password);
      setToken(result.idToken);
      setEmail(result.email);
      setPassword("");
      await loadConfig(result.idToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Administrator sign-in failed.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const walletTopups = JSON.parse(topups || "{}") as PricingConfig["walletTopups"];
      const googlePlayProducts = JSON.parse(products || "[]") as PricingConfig["googlePlayProducts"];
      const payload = {
        defaultRatePerMinuteMinor: Number(rate),
        minimumSessionBalanceMinor: Number(minimum),
        defaultProducerShareBps: Number(share),
        maxConcurrentSessions: Number(sessionLimit),
        walletTopups,
        googlePlayProducts,
      };
      const response = await fetch("/api/public/v1/admin/config/pricing", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { saved?: boolean; version?: number; error?: string };
      if (!response.ok || !result.saved) throw new Error(result.error ?? "Pricing could not be saved.");
      setVersion(result.version ?? null);
      setMessage("Pricing saved. The server will use this version for new sessions and purchases.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the numeric values and JSON fields.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030b2a] text-white">
      <header className="border-b border-cyan-300/15 bg-[#050f35]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <a href="/"><img src="/brand/bq-sqwad-tv-logo.svg" alt="BQ SQWAD TV" className="w-44" /></a>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Admin · Pricing</span>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300"><ShieldCheck size={16} /> Billing configuration</p>
        <h1 className="mt-4 text-3xl font-black sm:text-4xl">Set platform pricing.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-blue-100/60">All money values are integer kobo. Producer share is basis points: 10,000 equals 100%. No prices or revenue splits are preselected.</p>

        {!token ? (
          <form onSubmit={login} className="mt-9 grid max-w-md gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-6">
            <h2 className="text-xl font-bold">Administrator sign in</h2>
            <label className="grid gap-2 text-sm text-blue-100/70">Email<input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300" /></label>
            <label className="grid gap-2 text-sm text-blue-100/70">Password<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300" /></label>
            {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
            <button disabled={busy} className="rounded-xl bg-cyan-300 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        ) : (
          <form onSubmit={save} className="mt-9 grid gap-6 rounded-3xl border border-white/10 bg-[#07143d] p-6">
            <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Pricing configuration</h2><span className="text-xs text-cyan-200">{version === null ? "Not configured" : `Version ${version}`}</span></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-2 text-sm text-blue-100/70">Default rate per minute (kobo)<input type="number" min="1" step="1" required value={rate} onChange={event => setRate(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /></label>
              <label className="grid gap-2 text-sm text-blue-100/70">Minimum session balance (kobo)<input type="number" min="0" step="1" required value={minimum} onChange={event => setMinimum(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /></label>
              <label className="grid gap-2 text-sm text-blue-100/70">Producer share (basis points)<input type="number" min="0" max="10000" step="1" required value={share} onChange={event => setShare(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /></label>
              <label className="grid gap-2 text-sm text-blue-100/70">Concurrent playback sessions<input type="number" min="1" max="5" step="1" required value={sessionLimit} onChange={event => setSessionLimit(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /><span className="text-xs text-blue-100/45">1–5 devices/sessions per account; default 2.</span></label>
            </div>
            <label className="grid gap-2 text-sm text-blue-100/70">Website wallet packages — JSON object
              <textarea rows={7} required value={topups} onChange={event => setTopups(event.target.value)} placeholder='{"package_id":{"amountMinor":0,"creditMinor":0}}' className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white" />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">Google Play products — JSON array
              <textarea rows={7} required value={products} onChange={event => setProducts(event.target.value)} placeholder='[{"productId":"your_product_id","title":"Title","description":"Description","credits":1,"creditMinor":1,"active":true}]' className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white" />
            </label>
            <p className="text-xs leading-5 text-blue-100/45">Use real integer kobo values and the exact Google Play product IDs configured in Play Console. Saving creates a new audited pricing version.</p>
            {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
            {message ? <p role="status" className="text-sm text-cyan-200">{message}</p> : null}
            <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={17} /> : null} Save pricing version</button>
          </form>
        )}
      </section>
    </main>
  );
}
