import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, ShieldCheck, Tag, Film, Tv, Sparkles, History, Package, Globe, Download, Upload } from "lucide-react";
import { exportCountryPricingRulesCsv, parseCountryPricingRulesCsv, applyBulkCountryAdjustment, type CountryPricingRule } from "@/lib/server/pricing";
import { getWebAuthHeaders, signInWithEmailPassword } from "@/lib/firebase-web-auth";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";

export const Route = createFileRoute("/zillionaire/pricing")({
  component: AdminPricingPage,
  head: () => ({
    meta: [
      { title: "Pricing settings | BQ SQWAD TV" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

type PricingConfig = {
  version?: number;
  defaultRatePerMinuteMinor: number;
  minimumSessionBalanceMinor: number;
  defaultProducerShareBps: number;
  maxConcurrentSessions?: number;
  walletTopups: Record<string, { amountMinor: number; creditMinor?: number }>;
  walletTopupsByCurrency?: Record<
    string,
    Record<string, { amountMinor: number; creditMinor?: number }>
  >;
  defaultRatePerMinuteByCurrency?: Record<string, number>;
  minimumSessionBalanceByCurrency?: Record<string, number>;
  channelRatesById?: Record<string, Record<string, number>>;
  assetRatesById?: Record<string, Record<string, number>>;
  seriesRatesById?: Record<string, Record<string, number>>;
  episodeRatesById?: Record<string, Record<string, number>>;
  categoryRatesById?: Record<string, Record<string, number>>;
  liveStreamRatesById?: Record<string, Record<string, number>>;
  promoPricingWindows?: Array<{
    id: string;
    targetType: "movie" | "series" | "episode" | "channel" | "live_stream" | "category" | "global";
    targetId?: string;
    overrideRateMinor?: number;
    discountPercent?: number;
    startIso: string;
    endIso: string;
    label: string;
    active: boolean;
  }>;
  bundles?: Array<{
    id: string;
    title: string;
    description: string;
    assetIds: string[];
    priceMinor: number;
    currency: string;
    durationDays: number;
    active: boolean;
  }>;
  producerShareBpsByChannel?: Record<string, number>;
  dailySpendLimitByCurrency?: Record<string, number>;
  googlePlayProducts: Array<{
    productId: string;
    title: string;
    description: string;
    credits: number;
    creditMinor?: number;
    creditMinorByCurrency?: Record<string, number>;
    active: boolean;
  }>;
};

type HistoryEntry = {
  id: string;
  version: number;
  savedAt: string;
  savedBy: string;
  summary: string;
};

function AdminPricingPage() {
  return (
    <ConsolePageGuard role="zillionaire" module="finance" title="Pricing & rules" description="Configure viewing rates, wallet packages, currency pricing, revenue shares and promotional windows.">
      {({ token }) => <AdminPricingContent initialToken={token} />}
    </ConsolePageGuard>
  );
}

function AdminPricingContent({ initialToken }: { initialToken: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(initialToken);
  const [activeTab, setActiveTab] = useState<"defaults" | "content" | "channels" | "categories" | "promos" | "countries" | "history">("defaults");
  const [countryRules, setCountryRules] = useState("{}");
  const [exchangeRates, setExchangeRates] = useState("{}");
  const [bulkMultiplier, setBulkMultiplier] = useState("1.0");
  const [bulkTargetTier, setBulkTargetTier] = useState("all");
  const [csvInput, setCsvInput] = useState("");
  
  const [rate, setRate] = useState("200");
  const [minimum, setMinimum] = useState("0");
  const [share, setShare] = useState("7000");
  const [sessionLimit, setSessionLimit] = useState("2");
  
  const [topups, setTopups] = useState("");
  const [topupsByCurrency, setTopupsByCurrency] = useState("{}");
  const [ratesByCurrency, setRatesByCurrency] = useState("{}");
  const [minimumsByCurrency, setMinimumsByCurrency] = useState("{}");
  
  const [channelRates, setChannelRates] = useState("{}");
  const [liveStreamRates, setLiveStreamRates] = useState("{}");
  const [assetRates, setAssetRates] = useState("{}");
  const [seriesRates, setSeriesRates] = useState("{}");
  const [episodeRates, setEpisodeRates] = useState("{}");
  const [categoryRates, setCategoryRates] = useState("{}");
  const [promoWindows, setPromoWindows] = useState("[]");
  const [bundles, setBundles] = useState("[]");
  
  const [channelShares, setChannelShares] = useState("{}");
  const [dailyLimits, setDailyLimits] = useState("{}");
  const [products, setProducts] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [historyList, setHistoryList] = useState<HistoryEntry[]>([]);
  
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadConfig(idToken: string) {
    const response = await fetch("/api/public/v1/zillionaire/config/pricing", {
      headers: await getWebAuthHeaders(idToken),
    });
    if (response.status === 404) return;
    const data = (await response.json()) as PricingConfig & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load pricing configuration.");
    setRate(String(data.defaultRatePerMinuteMinor ?? 200));
    setMinimum(String(data.minimumSessionBalanceMinor ?? 0));
    setShare(String(data.defaultProducerShareBps ?? 7000));
    setSessionLimit(String(data.maxConcurrentSessions ?? 2));
    setTopups(JSON.stringify(data.walletTopups ?? {}, null, 2));
    setTopupsByCurrency(JSON.stringify(data.walletTopupsByCurrency ?? {}, null, 2));
    setRatesByCurrency(JSON.stringify(data.defaultRatePerMinuteByCurrency ?? {}, null, 2));
    setMinimumsByCurrency(JSON.stringify(data.minimumSessionBalanceByCurrency ?? {}, null, 2));
    setChannelRates(JSON.stringify(data.channelRatesById ?? {}, null, 2));
    setLiveStreamRates(JSON.stringify(data.liveStreamRatesById ?? {}, null, 2));
    setAssetRates(JSON.stringify(data.assetRatesById ?? {}, null, 2));
    setSeriesRates(JSON.stringify(data.seriesRatesById ?? {}, null, 2));
    setEpisodeRates(JSON.stringify(data.episodeRatesById ?? {}, null, 2));
    setCategoryRates(JSON.stringify(data.categoryRatesById ?? {}, null, 2));
    setPromoWindows(JSON.stringify(data.promoPricingWindows ?? [], null, 2));
    setBundles(JSON.stringify(data.bundles ?? [], null, 2));
    setChannelShares(JSON.stringify(data.producerShareBpsByChannel ?? {}, null, 2));
    setCountryRules(JSON.stringify(data.countryRules ?? {}, null, 2));
    setExchangeRates(JSON.stringify(data.exchangeRates ?? {}, null, 2));
    setDailyLimits(JSON.stringify(data.dailySpendLimitByCurrency ?? {}, null, 2));
    setProducts(JSON.stringify(data.googlePlayProducts ?? [], null, 2));
    setVersion(data.version ?? null);

    // Load history
    try {
      const histRes = await fetch("/api/public/v1/zillionaire/config/pricing?history=true", {
        headers: await getWebAuthHeaders(idToken),
      });
      if (histRes.ok) {
        const hData = await histRes.json();
        if (Array.isArray(hData.history)) {
          setHistoryList(hData.history);
        }
      }
    } catch {
      // History optional on load
    }
  }

  useEffect(() => {
    void loadConfig(initialToken).catch((caught) => {
      setError(caught instanceof Error ? caught.message : "Could not load pricing settings.");
    });
    // loadConfig is intentionally invoked once when the authenticated guard supplies a token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken]);

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
      setError(caught instanceof Error ? caught.message : "Dashboard sign-in failed.");
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
      const walletTopupsByCurrency = JSON.parse(topupsByCurrency || "{}") as NonNullable<
        PricingConfig["walletTopupsByCurrency"]
      >;
      const defaultRatePerMinuteByCurrency = JSON.parse(ratesByCurrency || "{}") as NonNullable<
        PricingConfig["defaultRatePerMinuteByCurrency"]
      >;
      const minimumSessionBalanceByCurrency = JSON.parse(minimumsByCurrency || "{}") as NonNullable<
        PricingConfig["minimumSessionBalanceByCurrency"]
      >;
      const channelRatesById = JSON.parse(channelRates || "{}") as NonNullable<
        PricingConfig["channelRatesById"]
      >;
      const liveStreamRatesById = JSON.parse(liveStreamRates || "{}") as NonNullable<
        PricingConfig["liveStreamRatesById"]
      >;
      const assetRatesById = JSON.parse(assetRates || "{}") as NonNullable<
        PricingConfig["assetRatesById"]
      >;
      const seriesRatesById = JSON.parse(seriesRates || "{}") as NonNullable<
        PricingConfig["seriesRatesById"]
      >;
      const episodeRatesById = JSON.parse(episodeRates || "{}") as NonNullable<
        PricingConfig["episodeRatesById"]
      >;
      const categoryRatesById = JSON.parse(categoryRates || "{}") as NonNullable<
        PricingConfig["categoryRatesById"]
      >;
      const promoPricingWindows = JSON.parse(promoWindows || "[]") as NonNullable<
        PricingConfig["promoPricingWindows"]
      >;
      const bundlesList = JSON.parse(bundles || "[]") as NonNullable<
        PricingConfig["bundles"]
      >;
      const producerShareBpsByChannel = JSON.parse(channelShares || "{}") as NonNullable<
        PricingConfig["producerShareBpsByChannel"]
      >;
      const dailySpendLimitByCurrency = JSON.parse(dailyLimits || "{}") as NonNullable<
        PricingConfig["dailySpendLimitByCurrency"]
      >;
      const googlePlayProducts = JSON.parse(
        products || "[]",
      ) as PricingConfig["googlePlayProducts"];
      const parsedCountryRules = JSON.parse(countryRules || "{}");
      const parsedExchangeRates = JSON.parse(exchangeRates || "{}");

      const payload = {
        countryRules: parsedCountryRules,
        exchangeRates: parsedExchangeRates,
        defaultRatePerMinuteMinor: Number(rate),
        minimumSessionBalanceMinor: Number(minimum),
        defaultProducerShareBps: Number(share),
        maxConcurrentSessions: Number(sessionLimit),
        walletTopups,
        walletTopupsByCurrency,
        defaultRatePerMinuteByCurrency,
        minimumSessionBalanceByCurrency,
        channelRatesById,
        liveStreamRatesById,
        assetRatesById,
        seriesRatesById,
        episodeRatesById,
        categoryRatesById,
        promoPricingWindows,
        bundles: bundlesList,
        producerShareBpsByChannel,
        dailySpendLimitByCurrency,
        googlePlayProducts,
      };

      const response = await fetch("/api/public/v1/zillionaire/config/pricing", {
        method: "PUT",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        saved?: boolean;
        version?: number;
        error?: string;
      };
      if (!response.ok || !result.saved)
        throw new Error(result.error ?? "Pricing could not be saved.");
      setVersion(result.version ?? null);
      setMessage("Pricing saved. The platform will use this version for new sessions and purchases.");
      
      // Refresh history
      const histRes = await fetch("/api/public/v1/zillionaire/config/pricing?history=true", {
        headers: await getWebAuthHeaders(token),
      });
      if (histRes.ok) {
        const hData = await histRes.json();
        if (Array.isArray(hData.history)) setHistoryList(hData.history);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Check the numeric values and JSON fields.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030b2a] text-white">
      <header className="border-b border-cyan-300/15 bg-[#050f35]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <a href="/">
            <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="w-44" />
          </a>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">
            Console · Pricing Control
          </span>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
          <ShieldCheck size={16} /> Owner Pricing Control
        </p>
        <h1 className="mt-4 text-3xl font-black sm:text-4xl">Platform pricing & schedules.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-blue-100/60">
          Set price per minute or free (0) for each movie, series, episode, channel, live stream, and
          category, along with promotional discount windows and bundles. Viewers see price before
          playback; rates remain completely confidential from producers and providers.
        </p>

        {!token ? (
          <form
            onSubmit={login}
            className="mt-9 grid max-w-md gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-6"
          >
            <h2 className="text-xl font-bold">Console sign-in</h2>
            <label className="grid gap-2 text-sm text-blue-100/70">
              Email
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300"
              />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300"
              />
            </label>
            {error ? (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            ) : null}
            <button
              disabled={busy}
              className="rounded-xl bg-cyan-300 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={save}
            className="mt-9 grid gap-6 rounded-3xl border border-white/10 bg-[#07143d] p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <Tag className="text-cyan-300" size={22} />
                <h2 className="text-xl font-bold">Pricing Rules & Overrides</h2>
              </div>
              <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-200">
                {version === null ? "Draft / Unsaved" : `Version ${version}`}
              </span>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
              <button
                type="button"
                onClick={() => setActiveTab("defaults")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  activeTab === "defaults"
                    ? "bg-cyan-400 text-slate-950"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Tag size={14} /> Defaults & Currencies
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("content")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  activeTab === "content"
                    ? "bg-cyan-400 text-slate-950"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Film size={14} /> Movies, Series & Episodes
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("channels")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  activeTab === "channels"
                    ? "bg-cyan-400 text-slate-950"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Tv size={14} /> Channels & Live Streams
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("categories")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  activeTab === "categories"
                    ? "bg-cyan-400 text-slate-950"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Package size={14} /> Categories
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("promos")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  activeTab === "promos"
                    ? "bg-cyan-400 text-slate-950"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Sparkles size={14} /> Promos & Bundles
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("countries")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  activeTab === "countries"
                    ? "bg-cyan-400 text-slate-950"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Globe size={14} /> Country Rules & FX
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  activeTab === "history"
                    ? "bg-cyan-400 text-slate-950"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <History size={14} /> History ({historyList.length})
              </button>
            </div>

            {/* TAB: DEFAULTS */}
            {activeTab === "defaults" && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="grid gap-2 text-sm text-blue-100/70">
                    Default NGN rate (kobo/min, 0 = Free)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={rate}
                      onChange={(event) => setRate(event.target.value)}
                      className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-blue-100/70">
                    Minimum viewing balance (kobo)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={minimum}
                      onChange={(event) => setMinimum(event.target.value)}
                      className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-blue-100/70">
                    Producer share bps (0–10,000)
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      step="1"
                      required
                      value={share}
                      onChange={(event) => setShare(event.target.value)}
                      className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-blue-100/70">
                    Concurrent sessions cap
                    <input
                      type="number"
                      min="1"
                      max="5"
                      step="1"
                      required
                      value={sessionLimit}
                      onChange={(event) => setSessionLimit(event.target.value)}
                      className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white"
                    />
                  </label>
                </div>

                <label className="grid gap-2 text-sm text-blue-100/70">
                  Default viewing rates by currency (minor units per minute, 0 = Free)
                  <textarea
                    rows={4}
                    required
                    value={ratesByCurrency}
                    onChange={(event) => setRatesByCurrency(event.target.value)}
                    placeholder='{"USD":25,"NGN":200,"GBP":20,"EUR":22}'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>

                <label className="grid gap-2 text-sm text-blue-100/70">
                  Minimum viewing balance by currency
                  <textarea
                    rows={4}
                    required
                    value={minimumsByCurrency}
                    onChange={(event) => setMinimumsByCurrency(event.target.value)}
                    placeholder='{"USD":100,"NGN":100}'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>

                <label className="grid gap-2 text-sm text-blue-100/70">
                  Wallet packages by currency
                  <textarea
                    rows={6}
                    required
                    value={topupsByCurrency}
                    onChange={(event) => setTopupsByCurrency(event.target.value)}
                    placeholder='{"USD":{"starter":{"amountMinor":499,"creditMinor":499}},"NGN":{"starter":{"amountMinor":50000,"creditMinor":50000}}}'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>

                <label className="grid gap-2 text-sm text-blue-100/70">
                  Daily viewer spending limits by currency
                  <textarea
                    rows={3}
                    required
                    value={dailyLimits}
                    onChange={(event) => setDailyLimits(event.target.value)}
                    placeholder='{"NGN":50000,"USD":500}'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>
              </div>
            )}

            {/* TAB: CONTENT (MOVIES, SERIES, EPISODES) */}
            {activeTab === "content" && (
              <div className="space-y-6">
                <label className="grid gap-2 text-sm text-blue-100/70">
                  Custom prices for a movie / title by currency (0 = Free)
                  <textarea
                    rows={5}
                    required
                    value={assetRates}
                    onChange={(event) => setAssetRates(event.target.value)}
                    placeholder='{"asset_id":{"NGN":300,"USD":35,"EUR":30}}'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>

                <label className="grid gap-2 text-sm text-blue-100/70">
                  Custom prices for a series by currency (applies to all episodes unless overridden)
                  <textarea
                    rows={5}
                    required
                    value={seriesRates}
                    onChange={(event) => setSeriesRates(event.target.value)}
                    placeholder='{"series_id":{"NGN":250,"USD":30}}'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>

                <label className="grid gap-2 text-sm text-blue-100/70">
                  Custom prices for specific episodes by currency (e.g. pilot free, finale premium)
                  <textarea
                    rows={5}
                    required
                    value={episodeRates}
                    onChange={(event) => setEpisodeRates(event.target.value)}
                    placeholder='{"episode_pilot_id":{"NGN":0,"USD":0},"episode_finale_id":{"NGN":400,"USD":50}}'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>
              </div>
            )}

            {/* TAB: CHANNELS & LIVE STREAMS */}
            {activeTab === "channels" && (
              <div className="space-y-6">
                <label className="grid gap-2 text-sm text-blue-100/70">
                  Custom prices for a channel by currency (hourly / 60)
                  <textarea
                    rows={5}
                    required
                    value={channelRates}
                    onChange={(event) => setChannelRates(event.target.value)}
                    placeholder='{"channel_id":{"NGN":12000,"USD":1500}}'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>

                <label className="grid gap-2 text-sm text-blue-100/70">
                  Custom prices for live streams by currency (minor units per minute, 0 = Free)
                  <textarea
                    rows={5}
                    required
                    value={liveStreamRates}
                    onChange={(event) => setLiveStreamRates(event.target.value)}
                    placeholder='{"live_stream_id":{"NGN":500,"USD":60}}'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>

                <label className="grid gap-2 text-sm text-blue-100/70">
                  Producer revenue share by channel (basis points: 7000 = 70%)
                  <textarea
                    rows={4}
                    required
                    value={channelShares}
                    onChange={(event) => setChannelShares(event.target.value)}
                    placeholder='{"channel_id":7000}'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>
              </div>
            )}

            {/* TAB: CATEGORIES */}
            {activeTab === "categories" && (
              <div className="space-y-6">
                <label className="grid gap-2 text-sm text-blue-100/70">
                  Default prices by category (action, drama, comedy, documentary, etc., 0 = Free)
                  <textarea
                    rows={6}
                    required
                    value={categoryRates}
                    onChange={(event) => setCategoryRates(event.target.value)}
                    placeholder='{"documentary":{"NGN":100,"USD":15},"news":{"NGN":0,"USD":0},"premium_action":{"NGN":350,"USD":40}}'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>
              </div>
            )}

            {/* TAB: PROMOS & BUNDLES */}
            {activeTab === "promos" && (
              <div className="space-y-6">
                <label className="grid gap-2 text-sm text-blue-100/70">
                  Promotional pricing windows & scheduled events (time-limited discounts or free periods)
                  <textarea
                    rows={7}
                    required
                    value={promoWindows}
                    onChange={(event) => setPromoWindows(event.target.value)}
                    placeholder='[{"id":"black_friday","targetType":"global","discountPercent":50,"startIso":"2026-11-20T00:00:00Z","endIso":"2026-11-30T23:59:59Z","label":"50% Off Black Friday","active":true}]'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>

                <label className="grid gap-2 text-sm text-blue-100/70">
                  Content bundles (packaged multi-title access passes)
                  <textarea
                    rows={6}
                    required
                    value={bundles}
                    onChange={(event) => setBundles(event.target.value)}
                    placeholder='[{"id":"hollywood_pass","title":"Blockbuster Bundle","description":"3 classic blockbusters","assetIds":["asset_1","asset_2"],"priceMinor":1500,"currency":"USD","durationDays":30,"active":true}]'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>

                <label className="grid gap-2 text-sm text-blue-100/70">
                  Store credit in-app products
                  <textarea
                    rows={5}
                    required
                    value={products}
                    onChange={(event) => setProducts(event.target.value)}
                    placeholder='[{"productId":"product_id","title":"Credits","description":"100 credits","credits":100,"creditMinorByCurrency":{"USD":499,"NGN":50000},"active":true}]'
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 font-mono text-xs text-white"
                  />
                </label>
              </div>
            )}

            {/* TAB: HISTORY */}
            {activeTab === "history" && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-300">
                  Pricing Revisions & Audit Log
                </h3>
                {historyList.length === 0 ? (
                  <p className="text-sm text-slate-400">No previous pricing snapshots recorded yet.</p>
                ) : (
                  <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-[#030b2a]">
                    {historyList.map((h) => (
                      <div key={h.id || h.version} className="flex items-center justify-between p-4">
                        <div>
                          <p className="text-sm font-bold text-white">Version {h.version}</p>
                          <p className="text-xs text-blue-100/60">{h.summary}</p>
                        </div>
                        <div className="text-right text-xs text-slate-400">
                          <p>{new Date(h.savedAt).toLocaleDateString()}</p>
                          <p>{new Date(h.savedAt).toLocaleTimeString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-xs leading-5 text-blue-100/45">
              Enter amounts in each currency's smallest integer unit (kobo for NGN, cents for USD).
              Free playback is configured by entering 0. Overrides take precedence in this order:
              promotional windows, episode overrides, movie rates, series rates, live streams,
              channel defaults, category defaults, then platform default.
            </p>

            {error ? (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            ) : null}
            {message ? (
              <p role="status" className="text-sm text-cyan-200">
                {message}
              </p>
            ) : null}
            <button
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="animate-spin" size={17} /> : null} Save price settings
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
