import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { getWebAuthHeaders, signInWithEmailPassword } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/admin/pricing")({
  component: AdminPricingPage,
  head: () => ({ meta: [{ title: "Pricing settings | BQ SQWAD TV" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
});

type PricingConfig = {
  version?: number;
  defaultRatePerMinuteMinor: number;
  minimumSessionBalanceMinor: number;
  defaultProducerShareBps: number;
  maxConcurrentSessions?: number;
  walletTopups: Record<string, { amountMinor: number; creditMinor?: number }>;
  walletTopupsByCurrency?: Record<string, Record<string, { amountMinor: number; creditMinor?: number }>>;
  defaultRatePerMinuteByCurrency?: Record<string, number>;
  minimumSessionBalanceByCurrency?: Record<string, number>;
  channelRatesById?: Record<string, Record<string, number>>;
  assetRatesById?: Record<string, Record<string, number>>;
  producerShareBpsByChannel?: Record<string, number>;
  dailySpendLimitByCurrency?: Record<string, number>;
  googlePlayProducts: Array<{ productId: string; title: string; description: string; credits: number; creditMinor?: number; creditMinorByCurrency?: Record<string, number>; active: boolean }>;
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
  const [topupsByCurrency, setTopupsByCurrency] = useState("{}");
  const [ratesByCurrency, setRatesByCurrency] = useState("{}");
  const [minimumsByCurrency, setMinimumsByCurrency] = useState("{}");
  const [channelRates, setChannelRates] = useState("{}");
  const [assetRates, setAssetRates] = useState("{}");
  const [channelShares, setChannelShares] = useState("{}");
  const [dailyLimits, setDailyLimits] = useState("{}");
  const [products, setProducts] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadConfig(idToken: string) {
    const response = await fetch("/api/public/v1/admin/config/pricing", {
      headers: await getWebAuthHeaders(idToken),
    });
    if (response.status === 404) return;
    const data = await response.json() as PricingConfig & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load pricing configuration.");
    setRate(String(data.defaultRatePerMinuteMinor));
    setMinimum(String(data.minimumSessionBalanceMinor));
    setShare(String(data.defaultProducerShareBps));
    setSessionLimit(String(data.maxConcurrentSessions ?? 2));
    setTopups(JSON.stringify(data.walletTopups ?? {}, null, 2));
    setTopupsByCurrency(JSON.stringify(data.walletTopupsByCurrency ?? {}, null, 2));
    setRatesByCurrency(JSON.stringify(data.defaultRatePerMinuteByCurrency ?? {}, null, 2));
    setMinimumsByCurrency(JSON.stringify(data.minimumSessionBalanceByCurrency ?? {}, null, 2));
    setChannelRates(JSON.stringify(data.channelRatesById ?? {}, null, 2));
    setAssetRates(JSON.stringify(data.assetRatesById ?? {}, null, 2));
    setChannelShares(JSON.stringify(data.producerShareBpsByChannel ?? {}, null, 2));
    setDailyLimits(JSON.stringify(data.dailySpendLimitByCurrency ?? {}, null, 2));
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
      setError(caught instanceof Error ? caught.message : "Zillionaire Dashboard sign-in failed.");
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
      const walletTopupsByCurrency = JSON.parse(topupsByCurrency || "{}") as NonNullable<PricingConfig["walletTopupsByCurrency"]>;
      const defaultRatePerMinuteByCurrency = JSON.parse(ratesByCurrency || "{}") as NonNullable<PricingConfig["defaultRatePerMinuteByCurrency"]>;
      const minimumSessionBalanceByCurrency = JSON.parse(minimumsByCurrency || "{}") as NonNullable<PricingConfig["minimumSessionBalanceByCurrency"]>;
      const channelRatesById = JSON.parse(channelRates || "{}") as NonNullable<PricingConfig["channelRatesById"]>;
      const assetRatesById = JSON.parse(assetRates || "{}") as NonNullable<PricingConfig["assetRatesById"]>;
      const producerShareBpsByChannel = JSON.parse(channelShares || "{}") as NonNullable<PricingConfig["producerShareBpsByChannel"]>;
      const dailySpendLimitByCurrency = JSON.parse(dailyLimits || "{}") as NonNullable<PricingConfig["dailySpendLimitByCurrency"]>;
      const googlePlayProducts = JSON.parse(products || "[]") as PricingConfig["googlePlayProducts"];
      const payload = {
        defaultRatePerMinuteMinor: Number(rate),
        minimumSessionBalanceMinor: Number(minimum),
        defaultProducerShareBps: Number(share),
        maxConcurrentSessions: Number(sessionLimit),
        walletTopups,
        walletTopupsByCurrency,
        defaultRatePerMinuteByCurrency,
        minimumSessionBalanceByCurrency,
        channelRatesById,
        assetRatesById,
        producerShareBpsByChannel,
        dailySpendLimitByCurrency,
        googlePlayProducts,
      };
      const response = await fetch("/api/public/v1/admin/config/pricing", {
        method: "PUT",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
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
          <a href="/"><img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="w-44" /></a>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Zillionaire Dashboard · Pricing</span>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300"><ShieldCheck size={16} /> Billing configuration</p>
        <h1 className="mt-4 text-3xl font-black sm:text-4xl">Set platform pricing.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-blue-100/60">Money is stored in each currency's integer minor units (for example, USD cents and NGN kobo). USD is the fallback for accounts without a country. Producer share is basis points: 10,000 equals 100%.</p>

        {!token ? (
          <form onSubmit={login} className="mt-9 grid max-w-md gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-6">
            <h2 className="text-xl font-bold">Zillionaire Dashboard sign-in</h2>
            <label className="grid gap-2 text-sm text-blue-100/70">Email<input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300" /></label>
            <label className="grid gap-2 text-sm text-blue-100/70">Password<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300" /></label>
            {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
            <button disabled={busy} className="rounded-xl bg-cyan-300 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        ) : (
          <form onSubmit={save} className="mt-9 grid gap-6 rounded-3xl border border-white/10 bg-[#07143d] p-6">
            <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Viewing and wallet prices</h2><span className="text-xs text-cyan-200">{version === null ? "Not configured" : `Version ${version}`}</span></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-2 text-sm text-blue-100/70">Default NGN viewing rate per minute (kobo)<input type="number" min="1" step="1" required value={rate} onChange={event => setRate(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /></label>
              <label className="grid gap-2 text-sm text-blue-100/70">Minimum NGN viewing balance (kobo)<input type="number" min="0" step="1" required value={minimum} onChange={event => setMinimum(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /></label>
              <label className="grid gap-2 text-sm text-blue-100/70">Producer share (0–10,000 = 0%–100%)<input type="number" min="0" max="10000" step="1" required value={share} onChange={event => setShare(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /></label>
              <label className="grid gap-2 text-sm text-blue-100/70">Devices watching at once<input type="number" min="1" max="5" step="1" required value={sessionLimit} onChange={event => setSessionLimit(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /><span className="text-xs text-blue-100/45">1–5 devices at once per account; default 2.</span></label>
            </div>
            <label className="grid gap-2 text-sm text-blue-100/70">Previous NGN wallet packages
              <textarea rows={7} required value={topups} onChange={event => setTopups(event.target.value)} placeholder='{"package_id":{"amountMinor":50000,"creditMinor":50000}}' className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white" />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">Wallet packages by currency
              <textarea rows={9} required value={topupsByCurrency} onChange={event => setTopupsByCurrency(event.target.value)} placeholder='{"USD":{"starter":{"amountMinor":499,"creditMinor":499}},"NGN":{"starter":{"amountMinor":50000,"creditMinor":50000}}}' className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white" />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">Default viewing rates by currency
              <textarea rows={4} required value={ratesByCurrency} onChange={event => setRatesByCurrency(event.target.value)} placeholder='{"USD":25,"NGN":200}' className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white" />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">Minimum viewing balance by currency
              <textarea rows={4} required value={minimumsByCurrency} onChange={event => setMinimumsByCurrency(event.target.value)} placeholder='{"USD":100,"NGN":100}' className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white" />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">Custom prices for a channel by currency
              <textarea rows={6} required value={channelRates} onChange={event => setChannelRates(event.target.value)} placeholder='{"123456":{"NGN":200,"USD":25}}' className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white" />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">Custom prices for a movie by currency
              <textarea rows={6} required value={assetRates} onChange={event => setAssetRates(event.target.value)} placeholder='{"asset_id":{"NGN":300,"USD":35}}' className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white" />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">Producer revenue share by channel
              <textarea rows={4} required value={channelShares} onChange={event => setChannelShares(event.target.value)} placeholder='{"123456":7000}' className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white" />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">Daily viewer spending limits by currency
              <textarea rows={4} required value={dailyLimits} onChange={event => setDailyLimits(event.target.value)} placeholder='{"NGN":50000,"USD":500}' className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white" />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">App store credit products
              <textarea rows={7} required value={products} onChange={event => setProducts(event.target.value)} placeholder='[{"productId":"your_product_id","title":"Title","description":"Description","credits":1,"creditMinorByCurrency":{"USD":499,"NGN":50000},"active":true}]' className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white" />
            </label>
            <p className="text-xs leading-5 text-blue-100/45">Enter amounts in each currency's smallest unit, such as kobo for NGN. XOF amounts are sent in the whole-unit format expected by the payment service. For app-store products, set a credit amount for every currency you support; the store displays local prices. Use the exact product references from the store dashboard. Movie-specific prices take priority over channel prices. Every save creates a dated, reviewed price record.</p>
            {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
            {message ? <p role="status" className="text-sm text-cyan-200">{message}</p> : null}
            <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={17} /> : null} Save price settings</button>
          </form>
        )}
      </section>
    </main>
  );
}
