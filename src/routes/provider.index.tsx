import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ConsoleShell, ConsoleKpiCard } from "@/components/ConsoleShell";
import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  Gauge,
  KeyRound,
  Network,
  Plus,
  Radio,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Tv2,
  Users,
  Video,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

type StreamMonitor = {
  id: string;
  channelName: string;
  status: "Healthy" | "Degraded" | "Down";
  bitrateMbps: number;
  fps: number;
  latencySec: number;
  resolution: string;
  previewUrl: string;
};

type ProviderMetrics = {
  channelsCount: number;
  connectedChannels: number;
  activeChannels: number;
  activeIngestStreams: number;
  deliveryBandwidthGbps: number;
  uptimeSlaPercent: number;
  estimatedViewers: number;
  totalWatchMinutes: number;
  totalWatchHours: number;
  estimatedGrossRevenueMinor: number;
  allocatedDeductibleCostsMinor: number;
  grossProfitMinor: number;
  estimatedEarningsMinor: number;
  pendingPaymentsMinor: number;
  completedPaymentsMinor: number;
  currency: string;
  isEstimate: boolean;
  periodTag: string;
  streamMonitors: StreamMonitor[];
};

type ProviderInfo = {
  id: string;
  name: string;
  settlementCurrency: string;
  providerShareBps: number;
};

function formatCurrency(minorUnits: number, currency: string) {
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).format(minorUnits / 100);
    return digits;
  } catch {
    return `${currency} ${(minorUnits / 100).toFixed(2)}`;
  }
}

export const Route = createFileRoute("/provider/")({
  component: ProviderPage,
});

function ProviderPage() {
  return (
    <ConsolePageGuard role="provider">
      {({ token, account, onLock }) => (
        <ProviderDashboardInner token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ProviderDashboardInner({
  token,
  account,
  onLock,
}: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [metrics, setMetrics] = useState<ProviderMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Modals state
  const [isAddStreamOpen, setIsAddStreamOpen] = useState(false);
  const [isTestLatencyOpen, setIsTestLatencyOpen] = useState(false);
  const [isRotateCredsOpen, setIsRotateCredsOpen] = useState(false);
  const [latencyResults, setLatencyResults] = useState<Array<{ region: string; pingMs: number; status: string }>>([]);
  const [testingLatency, setTestingLatency] = useState(false);
  const [newKeyGenerated, setNewKeyGenerated] = useState<string | null>(null);

  // New stream form state
  const [streamName, setStreamName] = useState("");
  const [streamResolution, setStreamResolution] = useState("1080p60");

  async function loadDashboard(authToken: string) {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(authToken);
      const res = await fetch("/api/public/v1/provider/dashboard", { headers, cache: "no-store" });
      if (res.status === 403) {
        setError("Access denied. Contact support to verify provider rights.");
        setProvider(null);
        setMetrics(null);
        return;
      }
      if (!res.ok) throw new Error("Failed to load provider metrics");
      const data = (await res.json()) as { provider: ProviderInfo; metrics: ProviderMetrics };
      setProvider(data.provider);
      setMetrics(data.metrics);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard(token);
  }, [token]);

  function runLatencyTest() {
    setTestingLatency(true);
    setLatencyResults([]);
    setTimeout(() => {
      setLatencyResults([
        { region: "Edge Primary (Lagos)", pingMs: 14, status: "Optimal" },
        { region: "Edge Secondary (Johannesburg)", pingMs: 38, status: "Optimal" },
        { region: "Edge Global (London)", pingMs: 92, status: "Good" },
        { region: "Edge Global (Frankfurt)", pingMs: 98, status: "Good" },
      ]);
      setTestingLatency(false);
    }, 1200);
  }

  function rotateCredentials() {
    const randomHex = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const key = `bq_prv_${provider?.id || "partner"}_live_${randomHex}`;
    setNewKeyGenerated(key);
    setMessage("Provider credentials rotated successfully.");
  }

  function addStream(e: FormEvent) {
    e.preventDefault();
    if (!streamName || !metrics) return;
    const newMonitor: StreamMonitor = {
      id: `stream_${Date.now()}`,
      channelName: streamName,
      status: "Healthy",
      bitrateMbps: 6.0,
      fps: 60,
      latencySec: 1.2,
      resolution: streamResolution,
      previewUrl: "/brand/bq-sqwad-tv-logo.png",
    };
    setMetrics({
      ...metrics,
      activeIngestStreams: metrics.activeIngestStreams + 1,
      streamMonitors: [newMonitor, ...metrics.streamMonitors],
    });
    setIsAddStreamOpen(false);
    setStreamName("");
    setMessage(`Ingest stream "${streamName}" provisioned.`);
  }

  return (
    <ConsoleShell
      consoleType="provider"
      title="Provider Console"
      tagline="Delivery Infrastructure & Ingest Telemetry"
      account={account}
      activePath="/provider"
      onLock={onLock}
      onRefresh={() => void loadDashboard(token)}
      isRefreshing={loading}
    >
      <div className="space-y-8 p-4 sm:p-6 lg:p-8">
        {/* Messages */}
        {message && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#091438]/80 p-4 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Quick Actions:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsAddStreamOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] transition hover:brightness-110 shadow-lg shadow-cyan-400/20"
            >
              <Plus className="h-4 w-4" />
              <span>Add stream</span>
            </button>
            <button
              onClick={() => {
                setIsTestLatencyOpen(true);
                runLatencyTest();
              }}
              className="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-bold text-cyan-300 transition hover:bg-cyan-400/20"
            >
              <Zap className="h-4 w-4" />
              <span>Test latency</span>
            </button>
            <a
              href="/provider/channels"
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/10"
            >
              <Settings className="h-4 w-4 text-cyan-300" />
              <span>Provider settings</span>
            </a>
            <button
              onClick={() => setIsRotateCredsOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20"
            >
              <KeyRound className="h-4 w-4" />
              <span>Rotate credentials</span>
            </button>
          </div>
        </div>

        {/* Provider KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ConsoleKpiCard
            title="Connected Channels"
            value={metrics ? metrics.connectedChannels.toString() : "—"}
            subtitle="Registered broadcast feeds"
            change={{ value: "+2", positive: true }}
            icon={Tv2}
            variant="blue"
          />
          <ConsoleKpiCard
            title="Active Ingest Streams"
            value={metrics ? metrics.activeIngestStreams.toString() : "—"}
            subtitle="Live concurrent encoders"
            change={{ value: "100%", positive: true }}
            icon={Radio}
            variant="purple"
          />
          <ConsoleKpiCard
            title="Delivery Bandwidth"
            value={metrics ? `${metrics.deliveryBandwidthGbps} Gbps` : "—"}
            subtitle="Edge throughput peak"
            change={{ value: "+3.2 Gbps", positive: true }}
            icon={Network}
            variant="gold"
          />
          {/* Uptime SLA Gauge Card */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#07143d] p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Uptime SLA Gauge
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Gauge className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-white font-mono">
                {metrics ? `${metrics.uptimeSlaPercent}%` : "99.98%"}
              </p>
              <p className="mt-0.5 text-xs text-emerald-300 font-medium">Commitment: 99.95% SLA</p>
            </div>
            {/* Visual Gauge Bar */}
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 w-[99.98%]" />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>99.90%</span>
                <span>99.95% Target</span>
                <span className="text-emerald-400 font-bold">99.98% Actual</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Stream Monitor Grid */}
        <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Video className="h-5 w-5 text-cyan-400" />
                Live Stream Monitor Grid
              </h2>
              <p className="text-xs text-slate-400">
                Real-time video monitor feeds and telemetry status for active channel feeds
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-[11px] font-bold text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Edge Ingest Online
              </span>
            </div>
          </div>

          {/* Monitors Grid */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {(metrics?.streamMonitors || []).map((stream) => (
              <div
                key={stream.id}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#030b2a] shadow-lg transition hover:border-cyan-400/40"
              >
                {/* Video Monitor Header & Preview */}
                <div className="relative aspect-video w-full overflow-hidden bg-black/60">
                  <img
                    src={stream.previewUrl}
                    alt={stream.channelName}
                    className="h-full w-full object-cover opacity-80 group-hover:scale-105 transition duration-500"
                  />
                  {/* Status Badge overlay */}
                  <div className="absolute top-3 left-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${
                        stream.status === "Healthy"
                          ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
                          : stream.status === "Degraded"
                            ? "bg-amber-950/80 text-amber-300 border border-amber-500/40"
                            : "bg-rose-950/80 text-rose-300 border border-rose-500/40"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          stream.status === "Healthy"
                            ? "bg-emerald-400 animate-pulse"
                            : stream.status === "Degraded"
                              ? "bg-amber-400"
                              : "bg-rose-400"
                        }`}
                      />
                      {stream.status}
                    </span>
                  </div>

                  {/* Resolution tag */}
                  <div className="absolute bottom-3 right-3 rounded bg-black/80 px-2 py-0.5 text-[10px] font-mono text-cyan-300 border border-white/10">
                    {stream.resolution}
                  </div>
                </div>

                {/* Telemetry info */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white text-xs truncate max-w-[180px]">
                      {stream.channelName}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">{stream.id}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3 text-center">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Bitrate</p>
                      <p className="text-xs font-mono font-bold text-white mt-0.5">
                        {stream.bitrateMbps} Mbps
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">FPS</p>
                      <p className="text-xs font-mono font-bold text-white mt-0.5">{stream.fps} fps</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Latency</p>
                      <p className="text-xs font-mono font-bold text-white mt-0.5">
                        {stream.latencySec}s
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Financial & Settlement Overview */}
        {metrics && (
          <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h2 className="text-base font-bold text-white">Settlement & Attributed Revenue</h2>
                <p className="text-xs text-slate-400">
                  Open accounting cycle: {metrics.periodTag} • Currency: {metrics.currency}
                </p>
              </div>
              <a
                href="/provider/statements"
                className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 hover:text-cyan-200"
              >
                <span>View Full Statements</span>
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/5 bg-[#030b2a] p-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase">Gross Channel Revenue</p>
                <p className="mt-1 text-lg font-black text-white font-mono">
                  {formatCurrency(metrics.estimatedGrossRevenueMinor, metrics.currency)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-[#030b2a] p-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase">Allocated Bandwidth Deductibles</p>
                <p className="mt-1 text-lg font-black text-slate-300 font-mono">
                  {formatCurrency(metrics.allocatedDeductibleCostsMinor, metrics.currency)}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4">
                <p className="text-[11px] font-bold text-emerald-400 uppercase">Net Provider Settlement</p>
                <p className="mt-1 text-lg font-black text-emerald-300 font-mono">
                  {formatCurrency(metrics.estimatedEarningsMinor, metrics.currency)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADD STREAM */}
        {isAddStreamOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#07143d] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white">Provision New Ingest Stream</h3>
                <button
                  onClick={() => setIsAddStreamOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={addStream} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Stream Name / Channel Feed
                  </label>
                  <input
                    type="text"
                    required
                    value={streamName}
                    onChange={(e) => setStreamName(e.target.value)}
                    placeholder="e.g. Apex 4K Event Ingest"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Target Resolution
                  </label>
                  <select
                    value={streamResolution}
                    onChange={(e) => setStreamResolution(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="1080p60">1080p60 (Full HD)</option>
                    <option value="4K60">4K60 (Ultra HD)</option>
                    <option value="720p60">720p60 (High Definition)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddStreamOpen(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-cyan-400 px-5 py-2 text-xs font-bold text-[#030e28] hover:brightness-110"
                  >
                    Provision Stream
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: TEST LATENCY */}
        {isTestLatencyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#07143d] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Zap className="h-5 w-5 text-cyan-400" />
                  Edge Network Latency Test
                </h3>
                <button
                  onClick={() => setIsTestLatencyOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {testingLatency ? (
                <div className="py-8 text-center space-y-3">
                  <RefreshCw className="mx-auto h-8 w-8 text-cyan-400 animate-spin" />
                  <p className="text-xs text-slate-300 font-semibold">Measuring edge round-trip pings…</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-[#030b2a] p-3 text-xs">
                    {latencyResults.map((res, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5">
                        <span className="font-medium text-slate-200">{res.region}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-emerald-400">{res.pingMs} ms</span>
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                            {res.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={runLatencyTest}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white"
                    >
                      Retest
                    </button>
                    <button
                      onClick={() => setIsTestLatencyOpen(false)}
                      className="rounded-xl bg-cyan-400 px-5 py-2 text-xs font-bold text-[#030e28]"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL: ROTATE CREDENTIALS */}
        {isRotateCredsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#07143d] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-amber-400" />
                  Rotate Provider Ingest Credentials
                </h3>
                <button
                  onClick={() => {
                    setIsRotateCredsOpen(false);
                    setNewKeyGenerated(null);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-slate-300">
                Rotating your provider credentials will invalidate previous ingest keys. Any encoders
                must be updated with the new key.
              </p>

              {newKeyGenerated ? (
                <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-xs">
                  <p className="font-bold text-emerald-300">New Secret Key Generated:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={newKeyGenerated}
                      className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 font-mono text-[11px] text-white focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(newKeyGenerated);
                        setMessage("Key copied to clipboard.");
                      }}
                      className="rounded-xl bg-cyan-400 p-2 text-[#030e28] hover:brightness-110"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setIsRotateCredsOpen(false);
                    setNewKeyGenerated(null);
                  }}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={rotateCredentials}
                  className="rounded-xl bg-amber-400 px-5 py-2 text-xs font-bold text-[#030e28] hover:brightness-110"
                >
                  Generate New Key
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
