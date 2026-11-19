import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Tv2,
  Radio,
  FileText,
  AlertCircle,
  HelpCircle,
  LogOut,
  LoaderCircle,
  TrendingUp,
  DollarSign,
  Clock,
  Users,
  ArrowUpRight,
} from "lucide-react";
import {
  getWebAuthHeaders,
  restoreWebSession,
  signInWithEmailPassword,
} from "@/lib/firebase-web-auth";

type ProviderMetrics = {
  channelsCount: number;
  activeChannels: number;
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
};

type ProviderInfo = {
  id: string;
  name: string;
  settlementCurrency: string;
  providerShareBps: number;
};

function formatCurrency(minorUnits: number, currency: string) {
  try {
    const digits =
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(minorUnits / 10 ** digits);
  } catch {
    return `${currency} ${(minorUnits / 100).toFixed(2)}`;
  }
}

export const Route = createFileRoute("/provider/")({
  component: ProviderPage,
  head: () => ({
    meta: [
      { title: "Partner Portal | BQ SQWAD TV" },
      { name: "description", content: "Licensed channel partner dashboard and statements." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProviderPage() {
  return (
    <ConsolePageGuard role="provider">
      {({ token, account }) => (
        <ProviderConsoleIndex sessionToken={token} isOwner={Boolean(account?.isOwner)} />
      )}
    </ConsolePageGuard>
  );
}

function ProviderConsoleIndex({
  sessionToken,
  isOwner,
}: { sessionToken?: string; isOwner?: boolean } = {}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [metrics, setMetrics] = useState<ProviderMetrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadDashboard(idToken: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/public/v1/provider/dashboard", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.status === 403) {
        setError("Your account is not registered as an active channel provider representative.");
        setProvider(null);
        setMetrics(null);
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load provider metrics");
      }
      const data = (await res.json()) as { provider: ProviderInfo; metrics: ProviderMetrics };
      setProvider(data.provider);
      setMetrics(data.metrics);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const tokenStr = sessionToken || (await restoreWebSession());
      if (!active) return;
      if (tokenStr) {
        setToken(tokenStr);
        void loadDashboard(tokenStr);
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionToken]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const creds = await signInWithEmailPassword(email, password);
      setToken(creds.idToken);
      await loadDashboard(creds.idToken);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/20">
              <Tv2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-cyan-300 bg-clip-text text-transparent">
                BQ SQWAD TV
              </div>
              <div className="text-xs text-cyan-400 font-medium">Channel Partner Console</div>
            </div>
          </div>

          {token && provider && (
            <div className="flex items-center gap-4">
              <nav className="hidden md:flex items-center gap-1 text-sm">
                <Link
                  to="/provider"
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  to="/provider/channels"
                  className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
                >
                  Channels
                </Link>
                <Link
                  to="/provider/statements"
                  className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
                >
                  Statements
                </Link>
                <Link
                  to="/provider/contracts"
                  className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
                >
                  Contract
                </Link>
                <Link
                  to="/provider/disputes"
                  className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
                >
                  Disputes
                </Link>
              </nav>

              <button
                onClick={() => {
                  setToken("");
                  setProvider(null);
                  setMetrics(null);
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-red-900/40 bg-slate-900"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        {isOwner && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/60 via-slate-900 to-slate-950 p-4 text-xs shadow-lg">
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-cyan-400/20 px-2.5 py-0.5 font-bold uppercase tracking-wider text-cyan-300">
                Platform Owner Access
              </span>
              <span className="text-slate-200 font-medium">
                You are signed in with verified owner access.
              </span>
            </div>
            <a
              href="/zillionaire"
              className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 font-bold text-cyan-300 hover:bg-cyan-500/20 transition"
            >
              Open Zillionaire Dashboard →
            </a>
          </div>
        )}
        {error && !provider ? (
          <div className="max-w-md mx-auto my-12 p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center">
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        ) : busy && !metrics ? (
          <div className="py-24 text-center">
            <LoaderCircle className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading partner metrics...</p>
          </div>
        ) : metrics && provider ? (
          <div className="space-y-8">
            {/* Header info */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-xl">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl font-bold text-white">{provider.name}</h1>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    Licensed Partner
                  </span>
                </div>
                <p className="text-sm text-slate-400">
                  Contract Share:{" "}
                  <span className="text-white font-semibold">
                    {(provider.providerShareBps / 100).toFixed(1)}%
                  </span>{" "}
                  of Net Gross Profit • Settlement Currency:{" "}
                  <span className="text-white font-semibold">{provider.settlementCurrency}</span>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="text-xs text-amber-300">
                  <span className="font-semibold">{metrics.periodTag}</span>
                  <div className="text-amber-400/80">
                    All open-period calculations are estimates based on real measured minutes.
                  </div>
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                  <span>Active Live Channels</span>
                  <Radio className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {metrics.activeChannels}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    / {metrics.channelsCount} total
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Est. Concurrent Viewers:{" "}
                  <span className="text-slate-200 font-medium">{metrics.estimatedViewers}</span>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                  <span>Watched Volume</span>
                  <Clock className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {metrics.totalWatchHours.toLocaleString()}{" "}
                  <span className="text-xs font-normal text-slate-400">hrs</span>
                </div>
                <div className="text-xs text-slate-400">
                  {metrics.totalWatchMinutes.toLocaleString()} verified minutes
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                  <span>Estimated Gross Profit</span>
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {formatCurrency(metrics.grossProfitMinor, metrics.currency)}
                </div>
                <div className="text-xs text-slate-400">
                  Gross: {formatCurrency(metrics.estimatedGrossRevenueMinor, metrics.currency)} •
                  Costs: {formatCurrency(metrics.allocatedDeductibleCostsMinor, metrics.currency)}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-br from-cyan-950/40 to-blue-950/40 border border-cyan-800/40">
                <div className="flex items-center justify-between text-cyan-300 text-xs mb-2">
                  <span>Est. Partner Earnings</span>
                  <DollarSign className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold text-cyan-300 mb-1">
                  {formatCurrency(metrics.estimatedEarningsMinor, metrics.currency)}
                </div>
                <div className="text-xs text-cyan-400/80">
                  Pending: {formatCurrency(metrics.pendingPaymentsMinor, metrics.currency)} •
                  Settled: {formatCurrency(metrics.completedPaymentsMinor, metrics.currency)}
                </div>
              </div>
            </div>

            {/* Quick Links & Modules */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link
                to="/provider/channels"
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition group"
              >
                <div className="flex items-center justify-between mb-3">
                  <Tv2 className="w-6 h-6 text-cyan-400" />
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition" />
                </div>
                <h3 className="font-semibold text-white mb-1">Manage Channels</h3>
                <p className="text-xs text-slate-400">
                  Inspect live stream health, programme schedules and broadcast metadata.
                </p>
              </Link>

              <Link
                to="/provider/statements"
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition group"
              >
                <div className="flex items-center justify-between mb-3">
                  <FileText className="w-6 h-6 text-blue-400" />
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition" />
                </div>
                <h3 className="font-semibold text-white mb-1">Monthly Statements</h3>
                <p className="text-xs text-slate-400">
                  Review closed statements, deductible costs breakdown and CSV exports.
                </p>
              </Link>

              <Link
                to="/provider/contracts"
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition group"
              >
                <div className="flex items-center justify-between mb-3">
                  <FileText className="w-6 h-6 text-amber-400" />
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition" />
                </div>
                <h3 className="font-semibold text-white mb-1">Licence Agreement</h3>
                <p className="text-xs text-slate-400">
                  Read-only terms, revenue share basis points, territory and platform grants.
                </p>
              </Link>

              <Link
                to="/provider/disputes"
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition group"
              >
                <div className="flex items-center justify-between mb-3">
                  <AlertCircle className="w-6 h-6 text-rose-400" />
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-rose-400 transition" />
                </div>
                <h3 className="font-semibold text-white mb-1">Disputes & Support</h3>
                <p className="text-xs text-slate-400">
                  Open and manage direct inquiry threads with platform operations.
                </p>
              </Link>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
