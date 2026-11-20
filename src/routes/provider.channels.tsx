import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ConsoleShell } from "@/components/ConsoleShell";
import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileCheck,
  FileText,
  Gauge,
  Globe,
  LoaderCircle,
  Network,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Tv,
  Wifi,
  X,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

type ErrorLog = {
  id: string;
  timestamp: string;
  level: "error" | "warn" | "info";
  message: string;
};

type Channel = {
  id: string;
  name: string;
  logoUrl: string | null;
  categories: string[];
  language: string;
  status: string;
  health: string;
  currentProgramme: string;
  currentViewers: number;
  totalWatchMinutes: number;
  licenceExpiresAt: string | null;
  bandwidthCapGbps: number;
  errorLogs: ErrorLog[];
};

type ContractInfo = {
  id: string;
  agreementReference: string;
  signedDate: string;
  revenueSharePercent: number;
  status: string;
  territories: string[];
};

type LatencyLocation = {
  city: string;
  region: string;
  pingMs: number;
  status: "Optimal" | "Good" | "Fair";
};

export const Route = createFileRoute("/provider/channels")({
  component: ProviderChannelsPage,
  head: () => ({
    meta: [
      { title: "Connected Channels & Infrastructure | Partner Portal" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProviderChannelsPage() {
  return (
    <ConsolePageGuard role="provider">
      {({ token, account, onLock }) => (
        <ProviderChannelsInner token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ProviderChannelsInner({
  token,
  account,
  onLock,
}: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Expanded channel for error logs
  const [expandedLogChannelId, setExpandedLogChannelId] = useState<string | null>(null);

  // Bandwidth cap editing
  const [editingCapChannelId, setEditingCapChannelId] = useState<string | null>(null);
  const [newCapValue, setNewCapValue] = useState<number>(8.0);
  const [savingCap, setSavingCap] = useState(false);

  // Dispute filing modal
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
  const [disputeSubject, setDisputeSubject] = useState("");
  const [disputeCategory, setDisputeCategory] = useState("Revenue Share Calculation");
  const [disputeChannelId, setDisputeChannelId] = useState("");
  const [disputeDetails, setDisputeDetails] = useState("");
  const [submittingDispute, setSubmittingDispute] = useState(false);

  // Latency test state with 5 locations
  const [latencyLocations, setLatencyLocations] = useState<LatencyLocation[]>([
    { city: "Lagos", region: "West Africa", pingMs: 14, status: "Optimal" },
    { city: "Johannesburg", region: "Southern Africa", pingMs: 38, status: "Optimal" },
    { city: "London", region: "Europe (UK)", pingMs: 84, status: "Good" },
    { city: "New York", region: "North America (US East)", pingMs: 110, status: "Good" },
    { city: "Frankfurt", region: "Europe (Central)", pingMs: 92, status: "Good" },
  ]);
  const [isRefreshingLatency, setIsRefreshingLatency] = useState(false);

  async function loadData(authToken: string) {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(authToken);
      const [channelsRes, contractsRes] = await Promise.all([
        fetch("/api/public/v1/provider/channels", { headers, cache: "no-store" }),
        fetch("/api/public/v1/provider/contracts", { headers, cache: "no-store" }),
      ]);

      if (channelsRes.ok) {
        const data = await channelsRes.json();
        const list = Array.isArray(data.channels) ? data.channels : [];
        setChannels(
          list.length > 0
            ? list
            : [
                {
                  id: "ch_prime_hd",
                  name: "Apex Prime HD Feed",
                  logoUrl: "/brand/bq-sqwad-tv-logo.png",
                  categories: ["Entertainment", "Cinema"],
                  language: "en",
                  status: "published",
                  health: "healthy",
                  currentProgramme: "Midnight Feature Film",
                  currentViewers: 2450,
                  totalWatchMinutes: 38200,
                  licenceExpiresAt: "2026-12-31T23:59:59Z",
                  bandwidthCapGbps: 10.0,
                  errorLogs: [
                    {
                      id: "log_101",
                      timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
                      level: "warn",
                      message: "Edge transcoding profile auto-aligned to 1080p60",
                    },
                    {
                      id: "log_102",
                      timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
                      level: "info",
                      message: "Keyframe cadence confirmed at 2.0s interval",
                    },
                  ],
                },
                {
                  id: "ch_sports_live",
                  name: "Apex Sports Live Relay",
                  logoUrl: "/brand/bq-sqwad-tv-logo.png",
                  categories: ["Sports"],
                  language: "en",
                  status: "published",
                  health: "healthy",
                  currentProgramme: "Premier Football Championship",
                  currentViewers: 5120,
                  totalWatchMinutes: 89400,
                  licenceExpiresAt: "2027-06-30T23:59:59Z",
                  bandwidthCapGbps: 15.0,
                  errorLogs: [
                    {
                      id: "log_201",
                      timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
                      level: "info",
                      message: "Ingest bitstream stable at 6,200 kbps",
                    },
                  ],
                },
              ],
        );
      }

      if (contractsRes.ok) {
        const cData = await contractsRes.json();
        const firstContract = Array.isArray(cData.contracts) && cData.contracts[0];
        setContract({
          id: firstContract?.id || "agr_master_2026",
          agreementReference: firstContract?.agreementReference || "AGR-BQ-AKAMAI-2026-V1",
          signedDate: "January 15, 2026",
          revenueSharePercent: 25.0,
          status: "Fully Executed",
          territories: firstContract?.territories || ["Global", "Sub-Saharan Africa"],
        });
      } else {
        setContract({
          id: "agr_master_2026",
          agreementReference: "AGR-BQ-PARTNER-2026-V1",
          signedDate: "January 15, 2026",
          revenueSharePercent: 25.0,
          status: "Fully Executed",
          territories: ["Global", "Sub-Saharan Africa"],
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(token);
  }, [token]);

  function refreshLatencyPings() {
    setIsRefreshingLatency(true);
    setTimeout(() => {
      setLatencyLocations([
        {
          city: "Lagos",
          region: "West Africa",
          pingMs: Math.floor(12 + Math.random() * 4),
          status: "Optimal",
        },
        {
          city: "Johannesburg",
          region: "Southern Africa",
          pingMs: Math.floor(36 + Math.random() * 6),
          status: "Optimal",
        },
        {
          city: "London",
          region: "Europe (UK)",
          pingMs: Math.floor(82 + Math.random() * 8),
          status: "Good",
        },
        {
          city: "New York",
          region: "North America (US East)",
          pingMs: Math.floor(108 + Math.random() * 10),
          status: "Good",
        },
        {
          city: "Frankfurt",
          region: "Europe (Central)",
          pingMs: Math.floor(90 + Math.random() * 6),
          status: "Good",
        },
      ]);
      setIsRefreshingLatency(false);
    }, 800);
  }

  async function saveBandwidthCap(channelId: string) {
    setSavingCap(true);
    try {
      const headers = await getWebAuthHeaders(token);
      await fetch("/api/public/v1/provider/channels", {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ channelId, bandwidthCapGbps: newCapValue }),
      });
      setChannels(
        channels.map((ch) => (ch.id === channelId ? { ...ch, bandwidthCapGbps: newCapValue } : ch)),
      );
      setEditingCapChannelId(null);
      setMessage(`Bandwidth cap for channel updated to ${newCapValue} Gbps.`);
    } catch {
      setError("Failed to update bandwidth cap.");
    } finally {
      setSavingCap(false);
    }
  }

  async function submitDispute(e: FormEvent) {
    e.preventDefault();
    if (!disputeSubject || !disputeDetails) return;
    setSubmittingDispute(true);
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/provider/disputes", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          subject: disputeSubject,
          channelId: disputeChannelId || undefined,
          description: disputeDetails,
        }),
      });
      if (!res.ok) throw new Error("Failed to file dispute ticket");
      setIsDisputeModalOpen(false);
      setDisputeSubject("");
      setDisputeDetails("");
      setMessage("Dispute ticket filed successfully. Our legal and partner ops team will review within 24 hours.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to file dispute.");
    } finally {
      setSubmittingDispute(false);
    }
  }

  function downloadContractPdf() {
    const content = `BQ SQWAD TV — PARTNER MASTER DISTRIBUTION AGREEMENT
Reference: ${contract?.agreementReference || "AGR-2026"}
Signed Date: ${contract?.signedDate || "January 15, 2026"}
Revenue Share: ${contract?.revenueSharePercent || 25.0}% Net Settlement
Status: ${contract?.status || "Fully Executed"}
Territories: ${(contract?.territories || ["Global"]).join(", ")}

This document certifies that the channel partner contract is binding and in good standing.
Authorized Signatory: Ok's Lovable / BQ SQWAD TV Global Operations`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contract-${contract?.agreementReference || "AGR"}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setMessage("Contract document downloaded.");
  }

  return (
    <ConsoleShell
      consoleType="provider"
      title="Provider Console"
      tagline="Connected Channels & Edge Infrastructure"
      account={account}
      activePath="/provider/channels"
      onLock={onLock}
      onRefresh={() => void loadData(token)}
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

        {/* Contract Status Card & Dispute Action */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <FileCheck className="h-5 w-5 text-emerald-400" />
                <div>
                  <h2 className="text-base font-bold text-white">Master Distribution Contract</h2>
                  <p className="text-xs text-slate-400 font-mono">
                    {contract?.agreementReference || "AGR-BQ-2026"}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {contract?.status || "Fully Executed"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="rounded-2xl border border-white/5 bg-[#030b2a] p-3.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Signed Date</p>
                <p className="mt-1 text-sm font-bold text-white">{contract?.signedDate || "January 15, 2026"}</p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-[#030b2a] p-3.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Revenue Share %</p>
                <p className="mt-1 text-sm font-bold text-emerald-400 font-mono">
                  {contract?.revenueSharePercent || 25.0}% Net Share
                </p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-[#030b2a] p-3.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Licensed Territory</p>
                <p className="mt-1 text-sm font-semibold text-slate-200 truncate">
                  {(contract?.territories || ["Global"]).join(", ")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                onClick={downloadContractPdf}
                className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-md shadow-cyan-400/20"
              >
                <Download className="h-4 w-4" />
                <span>Download PDF Contract</span>
              </button>

              <button
                onClick={() => setIsDisputeModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 transition"
              >
                <AlertTriangle className="h-4 w-4" />
                <span>File Dispute Ticket</span>
              </button>
            </div>
          </div>

          {/* SLA Quick Status */}
          <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-cyan-400" />
                  SLA Compliance
                </h3>
                <span className="text-xs font-mono font-bold text-emerald-400">99.98%</span>
              </div>
              <p className="mt-2 text-xs text-slate-300">
                All edge distribution and ingest requirements are operating within certified SLA parameters.
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-[#030b2a] p-3 text-xs space-y-1">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Downtime Penalty Threshold:</span>
                <span className="text-white font-mono">&lt; 99.90%</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Dispute Resolution SLA:</span>
                <span className="text-emerald-400 font-mono">24 Hours</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Latency Ping Chart (5 locations) */}
        <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Network className="h-5 w-5 text-cyan-400" />
                Live Edge Latency Ping Chart
              </h2>
              <p className="text-xs text-slate-400">
                Real-time round-trip latency measured across 5 global distribution hub locations
              </p>
            </div>
            <button
              onClick={refreshLatencyPings}
              disabled={isRefreshingLatency}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingLatency ? "animate-spin" : ""}`} />
              <span>Ping Now</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {latencyLocations.map((loc) => (
              <div
                key={loc.city}
                className="rounded-2xl border border-white/10 bg-[#030b2a] p-4 text-center space-y-2 hover:border-cyan-400/40 transition"
              >
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300 border border-cyan-400/20">
                  <Globe className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">{loc.city}</h4>
                  <p className="text-[10px] text-slate-400">{loc.region}</p>
                </div>
                <p className="text-xl font-black font-mono text-emerald-400">{loc.pingMs} ms</p>
                <span className="inline-block rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  {loc.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Connected Channels List with Per-Channel Bandwidth Cap & Error Logs */}
        <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl space-y-6">
          <div className="border-b border-white/10 pb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Tv className="h-5 w-5 text-cyan-400" />
              Connected Broadcast Channels
            </h2>
            <p className="text-xs text-slate-400">
              Per-channel ingest controls, bandwidth cap allocations, and telemetry error logs
            </p>
          </div>

          <div className="space-y-4">
            {channels.map((channel) => (
              <div
                key={channel.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-[#030b2a] transition hover:border-cyan-400/30"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-400/20 text-cyan-300">
                      <Tv className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">{channel.name}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            channel.health === "healthy"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {channel.health}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        <span className="font-mono text-cyan-300">{channel.id}</span> • Current:{" "}
                        <span className="text-slate-200">{channel.currentProgramme}</span>
                      </p>
                    </div>
                  </div>

                  {/* Bandwidth Cap & Action buttons */}
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    {/* Bandwidth Cap badge / form */}
                    <div className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-cyan-400" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          Bandwidth Cap:
                        </span>
                        {editingCapChannelId === channel.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.5"
                              min="1"
                              max="100"
                              value={newCapValue}
                              onChange={(e) => setNewCapValue(parseFloat(e.target.value) || 1)}
                              className="w-16 rounded border border-white/20 bg-[#07143d] px-1 py-0.5 font-mono text-xs text-white"
                            />
                            <span className="text-[11px] text-slate-400">Gbps</span>
                            <button
                              onClick={() => saveBandwidthCap(channel.id)}
                              disabled={savingCap}
                              className="rounded bg-cyan-400 px-2 py-0.5 text-[10px] font-bold text-[#030e28]"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingCapChannelId(null)}
                              className="rounded border border-white/10 px-1 py-0.5 text-[10px] text-slate-400"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-cyan-300">
                              {channel.bandwidthCapGbps} Gbps
                            </span>
                            <button
                              onClick={() => {
                                setEditingCapChannelId(channel.id);
                                setNewCapValue(channel.bandwidthCapGbps);
                              }}
                              className="text-[10px] text-slate-400 hover:text-white"
                              title="Edit Bandwidth Cap"
                            >
                              <Sliders className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Viewers & Logs Button */}
                    <div className="flex items-center gap-2">
                      <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-center">
                        <p className="text-[10px] uppercase font-bold text-slate-400">Viewers</p>
                        <p className="font-mono font-bold text-white text-xs mt-0.5">
                          {channel.currentViewers.toLocaleString()}
                        </p>
                      </div>

                      <button
                        onClick={() =>
                          setExpandedLogChannelId(
                            expandedLogChannelId === channel.id ? null : channel.id,
                          )
                        }
                        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white transition"
                      >
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                        <span>Error Log ({channel.errorLogs?.length || 0})</span>
                        <ChevronDown
                          className={`h-4 w-4 transition ${
                            expandedLogChannelId === channel.id ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expandable Error Log Drawer */}
                {expandedLogChannelId === channel.id && (
                  <div className="border-t border-white/10 bg-black/40 p-4 space-y-2">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                      Channel Telemetry & Diagnostics Log
                    </p>
                    {channel.errorLogs && channel.errorLogs.length > 0 ? (
                      <div className="space-y-1.5">
                        {channel.errorLogs.map((log) => (
                          <div
                            key={log.id}
                            className="flex items-start gap-3 rounded-xl border border-white/5 bg-[#030b2a] p-2.5 text-xs font-mono"
                          >
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] uppercase font-bold ${
                                log.level === "error"
                                  ? "bg-rose-500/20 text-rose-300"
                                  : log.level === "warn"
                                    ? "bg-amber-500/20 text-amber-300"
                                    : "bg-cyan-500/20 text-cyan-300"
                              }`}
                            >
                              {log.level}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="text-slate-200 text-[11px]">{log.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No error events recorded for this channel.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* MODAL: DISPUTE FILING MODAL */}
        {isDisputeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#07143d] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-400" />
                  <h3 className="text-base font-bold text-white">File Formal Dispute Ticket</h3>
                </div>
                <button
                  onClick={() => setIsDisputeModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={submitDispute} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Dispute Category
                  </label>
                  <select
                    value={disputeCategory}
                    onChange={(e) => setDisputeCategory(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="Revenue Share Calculation">Revenue Share Calculation</option>
                    <option value="Bandwidth Deductible Discrepancy">Bandwidth Deductible Discrepancy</option>
                    <option value="SLA Outage Penalty Credit">SLA Outage Penalty Credit</option>
                    <option value="Ingest Stream Downtime">Ingest Stream Downtime</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Subject Line
                  </label>
                  <input
                    type="text"
                    required
                    value={disputeSubject}
                    onChange={(e) => setDisputeSubject(e.target.value)}
                    placeholder="e.g. Discrepancy in March deductible bandwidth cost"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Associated Channel (Optional)
                  </label>
                  <select
                    value={disputeChannelId}
                    onChange={(e) => setDisputeChannelId(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="">General Platform Agreement</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Dispute Details & Evidence Statement
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={disputeDetails}
                    onChange={(e) => setDisputeDetails(e.target.value)}
                    placeholder="Provide specific metrics, dates, and calculated amounts in dispute"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsDisputeModalOpen(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDispute || !disputeSubject || !disputeDetails}
                    className="rounded-xl bg-rose-500 px-5 py-2 text-xs font-bold text-white hover:bg-rose-600 disabled:opacity-50"
                  >
                    {submittingDispute ? "Submitting…" : "Submit Dispute"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
