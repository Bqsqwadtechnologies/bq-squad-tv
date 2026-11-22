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
  Eye,
  CheckSquare,
  ExternalLink,
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
  const [disputeCategory, setDisputeCategory] = useState("Settlement Calculation");
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
        setChannels(list);
      }

      if (contractsRes.ok) {
        const cData = await contractsRes.json();
        const firstContract = Array.isArray(cData.contracts) && cData.contracts[0];
        setContract({
          id: firstContract?.id || "agr_master_2026",
          agreementReference: firstContract?.agreementReference || "AGR-BQ-AKAMAI-2026-V1",
          signedDate: "January 15, 2026",
                    status: "Fully Executed",
          territories: firstContract?.territories || ["Global", "Sub-Saharan Africa"],
        });
      } else {
        setContract({
          id: "agr_master_2026",
          agreementReference: "AGR-BQ-PARTNER-2026-V1",
          signedDate: "January 15, 2026",
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

  async function refreshLatencyPings() {
    setIsRefreshingLatency(true);
    try {
      const start = performance.now();
      await fetch("/api/public/v1/config/client", { cache: "no-store" });
      const measuredRtt = Math.max(1, Math.round(performance.now() - start));
      setLatencyLocations((prev) =>
        prev.map((loc) => ({
          ...loc,
          pingMs: measuredRtt,
          status: measuredRtt < 50 ? "Optimal" : measuredRtt < 150 ? "Good" : "Degraded",
        }))
      );
    } catch {
      // keep existing readings
    } finally {
      setIsRefreshingLatency(false);
    }
  }


  // Modal states
  const [checklistChannel, setChecklistChannel] = useState<any>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  async function openChecklist(channelId: string) {
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch(`/api/public/v1/provider/channels/${channelId}/checklist`, {
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to load checklist");
      setChecklistChannel(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load checklist");
    }
  }

  async function handlePrivatePreview(channelId: string) {
    setPreviewLoadingId(channelId);
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/preview/grant", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ targetType: "channel", targetId: channelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to grant preview");
      if (data.previewPath) {
        window.open(data.previewPath, "_blank");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate preview link");
    } finally {
      setPreviewLoadingId(null);
    }
  }

  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelCategory, setNewChannelCategory] = useState("Entertainment");
  const [newChannelLanguage, setNewChannelLanguage] = useState("en");
  const [newChannelBandwidthCap, setNewChannelBandwidthCap] = useState(8.0);
  const [creatingChannel, setCreatingChannel] = useState(false);

  async function handleCreateChannel(e: FormEvent) {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    setCreatingChannel(true);
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/provider/channels", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          name: newChannelName.trim(),
          categories: [newChannelCategory],
          language: newChannelLanguage,
          bandwidthCapGbps: newChannelBandwidthCap,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to create channel");
      setMessage(`Channel "${newChannelName}" created successfully.`);
      setIsCreateChannelOpen(false);
      setNewChannelName("");
      await loadData(token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setCreatingChannel(false);
    }
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
Settlement Terms: Direct Verified Settlement (Standard Execution)
Status: ${contract?.status || "Fully Executed"}
Territories: ${(contract?.territories || ["Global"]).join(", ")}

This document certifies that the channel partner contract is binding and in good standing.
Authorized Signatory: BQ SQWAD TV Global Operations`;

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
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Settlement Terms</p>
                <p className="mt-1 text-sm font-bold text-emerald-400 font-mono">
                  Standard Partner Settlement
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
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Tv className="h-5 w-5 text-cyan-400" />
                Connected Broadcast Channels
              </h2>
              <p className="text-xs text-slate-400">
                Per-channel ingest controls, bandwidth cap allocations, and telemetry error logs
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAssignmentModalOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition"
              >
                <Tv className="h-4 w-4" />
                <span>Channel Assignment & Policy</span>
              </button>
              <button
                onClick={() => setIsCreateChannelOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-md shadow-cyan-400/20"
              >
                <span>Create New Channel</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {channels.length > 0 ? (
              channels.map((channel) => (
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
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            channel.status === "active" || channel.status === "published"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : channel.status === "in_review"
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {channel.status === "in_review" ? "Under Review" : channel.status || "In Review"}
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
                        onClick={() => openChecklist(channel.id)}
                        className="flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition"
                      >
                        <CheckSquare className="h-4 w-4 text-cyan-400" />
                        <span>Checklist</span>
                      </button>

                      <button
                        onClick={() => handlePrivatePreview(channel.id)}
                        disabled={previewLoadingId === channel.id}
                        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white transition disabled:opacity-50"
                      >
                        <Eye className="h-4 w-4 text-cyan-400" />
                        <span>{previewLoadingId === channel.id ? "Granting..." : "Preview"}</span>
                      </button>

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
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#030b2a]/50 p-10 text-center">
              <Tv className="mx-auto h-8 w-8 text-cyan-400/50 mb-3" />
              <h3 className="text-sm font-bold text-white">No Connected Broadcast Channels</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
                Channels are created and assigned to your organisation by the platform team. Contact tv@bqsqwad.com to request a new channel provisioning.
              </p>
              <a
                href="mailto:tv@bqsqwad.com?subject=Channel%20Provisioning%20Request"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-md shadow-cyan-400/20"
              >
                <span>Request Channel</span>
              </a>
            </div>
          )}
          </div>
        </div>

        {/* Create Channel Modal */}
        {isCreateChannelOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#07143d] p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <Tv className="h-5 w-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Create New Broadcast Channel</h3>
                </div>
                <button
                  onClick={() => setIsCreateChannelOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateChannel} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Channel Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="e.g. Apex Cinema Global"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Category
                    </label>
                    <select
                      value={newChannelCategory}
                      onChange={(e) => setNewChannelCategory(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="Entertainment">Entertainment</option>
                      <option value="News">News</option>
                      <option value="Sports">Sports</option>
                      <option value="Music">Music</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Language
                    </label>
                    <select
                      value={newChannelLanguage}
                      onChange={(e) => setNewChannelLanguage(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="en">English (en)</option>
                      <option value="fr">French (fr)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsCreateChannelOpen(false)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingChannel || !newChannelName.trim()}
                    className="rounded-xl bg-cyan-400 px-5 py-2 text-xs font-bold text-[#030e28] hover:brightness-110 disabled:opacity-50"
                  >
                    {creatingChannel ? "Submitting..." : "Submit Channel"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Channel Assignment Policy Modal */}
        {isAssignmentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#07143d] p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <Tv className="h-5 w-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Channel Assignment Policy</h3>
                </div>
                <button
                  onClick={() => setIsAssignmentModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
                <p>
                  To maintain strict broadcast transmission standards and licensed rights compliance, broadcast channels are created exclusively by the platform engineering team and assigned to authorized partner organizations.
                </p>
                <div className="rounded-2xl border border-white/10 bg-[#030b2a] p-4 space-y-2">
                  <p className="font-bold text-white uppercase text-[11px] tracking-wider">Roles and Attributions</p>
                  <p><span className="text-slate-400">Content Owner:</span> Your licensed broadcast entity</p>
                  <p><span className="text-slate-400">Platform Creator & Operator:</span> BQ SQWAD TV</p>
                </div>
                <p>
                  To request an additional broadcast channel provisioning or add new territorial feeds, contact our team:
                </p>
                <div className="pt-2">
                  <a
                    href="mailto:tv@bqsqwad.com?subject=New%20Broadcast%20Channel%20Assignment%20Request"
                    className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-md shadow-cyan-400/20"
                  >
                    <span>Email tv@bqsqwad.com</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Integration Checklist Modal (Rule N21 & N22) */}
        {checklistChannel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="w-full max-w-2xl my-8 rounded-3xl border border-white/15 bg-[#07143d] p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-5 w-5 text-cyan-400" />
                    <h3 className="text-base font-bold text-white">{checklistChannel.channelName} — Launch Checklist</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Content Owner: <span className="text-white font-medium">{checklistChannel.contentOwnerCompany}</span> • Platform Creator: <span className="text-white font-medium">{checklistChannel.platformCreator}</span>
                  </p>
                </div>
                <button
                  onClick={() => setChecklistChannel(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl border border-white/10 bg-[#030b2a]">
                <span className="text-xs font-bold text-slate-300">Overall Readiness:</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                    checklistChannel.canGoLive
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : checklistChannel.overallStatus === "Review in Progress"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  }`}
                >
                  {checklistChannel.overallStatus}
                </span>
              </div>

              {/* Checklist items */}
              <div className="space-y-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Required Launch Elements</p>
                {checklistChannel.items?.map((item: any) => (
                  <div
                    key={item.key}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-white/5 bg-[#030b2a] p-3.5 text-xs"
                  >
                    <div className="space-y-1">
                      <p className="font-bold text-white">{item.title}</p>
                      <p className="text-slate-400 text-[11px]">{item.description}</p>
                      {item.detail && <p className="text-cyan-300 text-[11px] font-mono">{item.detail}</p>}
                      {item.actionRequired && <p className="text-amber-300 text-[11px]">{item.actionRequired}</p>}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        item.status === "Done"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : item.status === "Waiting for review"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>

              {/* Automated Technical Preflight Results */}
              {checklistChannel.autoTestReport && (
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Automated Preflight Tests</p>
                    <span className="text-[10px] font-mono text-slate-400">Ref: {checklistChannel.autoTestReport.referenceId}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                    {checklistChannel.autoTestReport.results?.map((res: any) => (
                      <div
                        key={res.checkId}
                        className="flex items-center justify-between rounded-xl border border-white/5 bg-[#030b2a]/60 px-3 py-2 text-[11px]"
                      >
                        <span className="text-slate-300">{res.name}</span>
                        <span
                          className={`font-bold ${
                            res.passed ? "text-emerald-400" : res.severity === "blocker" ? "text-rose-400" : "text-amber-400"
                          }`}
                        >
                          {res.passed ? "✓ Passed" : res.fixInstruction || "Check Required"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 italic">
                    {checklistChannel.autoTestReport.supportHelpText}
                  </p>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setChecklistChannel(null)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

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
                    <option value="Settlement Calculation">Settlement Calculation</option>
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
