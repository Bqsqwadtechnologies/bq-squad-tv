import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleTable,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import {
  Tv,
  Plus,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Search,
  BadgeCheck,
  Ban,
  Star,
  Users,
  Film,
  Radio,
  ArrowRightLeft,
  Trash2,
  AtSign,
  Percent,
  CheckCircle2,
  X,
  AlertTriangle,
  RotateCcw,
  Sliders,
  DollarSign,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/channels")({
  component: ZillionaireChannelsRoute,
  head: () => ({
    meta: [
      { title: "Channels Master Control | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface ChannelItem {
  id: string;
  title: string;
  handle: string;
  description: string;
  category: string;
  logoUrl: string | null;
  deliveryMode: string;
  type: "platform" | "provider";
  ownerUid: string;
  providerId: string;
  status: string;
  published: boolean;
  verified: boolean;
  featured: boolean;
  isLive: boolean;
  liveStreamingAllowed: boolean;
  monetizationStatus: string;
  producerShareBps: number;
  producerSharePercent: number;
  subscribersCount: number;
  videosCount: number;
  deletedAt: string | null;
  suspendedReason: string | null;
  createdAt: string | null;
}

function ZillionaireChannelsRoute() {
  return (
    <ConsolePageGuard
      role="zillionaire"
      module="channels"
      title="Channels Master Control"
      description="Full catalogue channel management: verification badges, suspension, revenue share overrides, transfer, live permission."
    >
      {(token, account, onLock) => (
        <ZillionaireChannelsPage token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionaireChannelsPage({
  account,
  onLock,
}: {
  token: string | null;
  account: { uid: string; email?: string; roles?: string[]; modules?: string[]; isOwner?: boolean } | null;
  onLock?: () => void;
}) {
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Channel Creation Wizard state (Batch N17)
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [wizardForm, setWizardForm] = useState({
    title: "",
    category: "Entertainment",
    description: "",
    customSlug: "",
    language: "en",
    contentRating: "G" as "G" | "PG" | "13+" | "16+" | "18+",
    adultOnly: false,
    partnerCompanyName: "",
    partnerEmail: "",
    partnerRole: "Manager" as "Manager" | "Editor" | "Viewer",
    paid: false,
    currency: "USD",
    ratePerMinuteMinor: 25,
    revenueShareBps: 7000,
    reason: "",
  });
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  async function handleCreateChannelSubmit() {
    setWizardSubmitting(true);
    setWizardError(null);
    try {
      if (!wizardForm.title.trim()) throw new Error("Channel title is required.");
      if (wizardForm.reason.trim().length < 3) throw new Error("Audit reason must be at least 3 characters.");

      const authHeaders = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/channels", {
        method: "POST",
        headers: {
          ...authHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...wizardForm,
          ratePerMinuteMinor: wizardForm.paid ? Number(wizardForm.ratePerMinuteMinor) : 0,
          revenueShareBps: Number(wizardForm.revenueShareBps) || 7000,
          partnerEmail: wizardForm.partnerEmail.trim() || undefined,
          partnerCompanyName: wizardForm.partnerCompanyName.trim() || undefined,
          customSlug: wizardForm.customSlug.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || "Failed to create channel.");
      }

      setActionFeedback(`Channel ${data.slug} (${data.channelId}) created successfully!`);
      setIsWizardOpen(false);
      setWizardStep(1);
      setWizardForm({
        title: "",
        category: "Entertainment",
        description: "",
        customSlug: "",
        language: "en",
        contentRating: "G",
        adultOnly: false,
        partnerCompanyName: "",
        partnerEmail: "",
        partnerRole: "Manager",
        paid: false,
        currency: "USD",
        ratePerMinuteMinor: 25,
        revenueShareBps: 7000,
        reason: "",
      });
      await loadChannels();
    } catch (err: any) {
      setWizardError(err.message || "Channel creation failed.");
    } finally {
      setWizardSubmitting(false);
    }
  }
  const [filterType, setFilterType] = useState<"ALL" | "VERIFIED" | "LIVE" | "SUSPENDED" | "DELETED" | "FEATURED">("ALL");

  // Transfer Ownership Modal
  const [transferTarget, setTransferTarget] = useState<ChannelItem | null>(null);
  const [newOwnerUid, setNewOwnerUid] = useState("");
  const [transferReason, setTransferReason] = useState("");

  // Change Handle Modal
  const [handleTarget, setHandleTarget] = useState<ChannelItem | null>(null);
  const [newHandle, setNewHandle] = useState("");
  const [handleReason, setHandleReason] = useState("");

  // Revenue Share Override Modal
  const [revShareTarget, setRevShareTarget] = useState<ChannelItem | null>(null);
  const [selectedShareBps, setSelectedShareBps] = useState<number>(7000);
  const [revShareReason, setRevShareReason] = useState("");

  // Generic Reason Confirmation Modal
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [targetChannelId, setTargetChannelId] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const headers = await getWebAuthHeaders();
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (filterType !== "ALL") params.set("filter", filterType);

      const res = await fetch(`/api/public/v1/zillionaire/channels/?${params.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, [searchQuery, filterType]);

  const executeAction = async (channelId: string, actionBody: Record<string, unknown>) => {
    setSubmittingAction(true);
    setActionFeedback(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch(`/api/public/v1/zillionaire/channels/${channelId}/actions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(actionBody),
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback("Action executed and permanently logged in audit trail.");
        setPendingAction(null);
        setTargetChannelId(null);
        setActionReason("");
        setTransferTarget(null);
        setHandleTarget(null);
        setRevShareTarget(null);
        await fetchChannels();
      } else {
        setActionFeedback(`Action failed: ${data.message || data.error}`);
      }
    } catch (err: unknown) {
      setActionFeedback(err instanceof Error ? err.message : "Error executing action.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const stats = useMemo(() => {
    const total = channels.length;
    const verified = channels.filter((c) => c.verified).length;
    const live = channels.filter((c) => c.isLive).length;
    const customShare = channels.filter((c) => c.producerShareBps !== 7000).length;
    return { total, verified, live, customShare };
  }, [channels]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Channels Master Control"
      subtitle="Complete channel governance: verified badges, revenue share splits, handle controls, ownership transfer"
      account={account}
      onLock={onLock}
      activePath="/zillionaire/channels"
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Channels Master Governance"
          subtitle="Manage both Platform channels and external Provider streams. Suspending a channel instantly prevents playback of all its hosted content."
        />

        {/* Feedback alert */}
        {actionFeedback && (
          <div className="p-3 bg-cyan-950/60 border border-cyan-800 rounded-lg text-cyan-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>{actionFeedback}</span>
            </div>
            <button onClick={() => setActionFeedback(null)} className="text-cyan-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ConsoleKpiCard
            title="Total Channels"
            value={stats.total.toLocaleString()}
            change="Platform & Provider"
            icon={<Tv className="w-5 h-5" />}
            color="blue"
          />
          <ConsoleKpiCard
            title="Verified Badges"
            value={stats.verified.toLocaleString()}
            change="Official channels"
            icon={<BadgeCheck className="w-5 h-5" />}
            color="purple"
          />
          <ConsoleKpiCard
            title="Live Broadcasts"
            value={stats.live.toLocaleString()}
            change="Actively streaming"
            icon={<Radio className="w-5 h-5" />}
            color="green"
          />
          <ConsoleKpiCard
            title="Custom Rev-Share"
            value={stats.customShare.toLocaleString()}
            change="Overridden splits"
            icon={<DollarSign className="w-5 h-5" />}
            color="gold"
          />
        </div>

        {/* Search & Filter Bar */}
        <ConsoleCard
          title="Channel Catalogue Browser"
          actions={
            <button
              type="button"
              onClick={() => {
                setIsWizardOpen(true);
                setWizardStep(1);
                setWizardError(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-[#030e28] text-xs font-bold rounded-lg transition shadow-md shadow-cyan-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Create Channel Wizard</span>
            </button>
          }
        >
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, handle, owner UID, provider ID..."
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1">
              {(["ALL", "VERIFIED", "LIVE", "SUSPENDED", "DELETED", "FEATURED"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setFilterType(filter)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    filterType === filter ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </ConsoleCard>

        {/* Channels Table */}
        <ConsoleCard title={`Channel Directory (${channels.length} Channels)`}>
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading channels...</div>
          ) : channels.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No channels found matching query.</div>
          ) : (
            <ConsoleTable
              columns={[
                { key: "channel", label: "Logo, Name & Handle" },
                { key: "type", label: "Type & Owner / Provider" },
                { key: "stats", label: "Subscribers & Videos" },
                { key: "status", label: "Live & Monetization" },
                { key: "revshare", label: "Revenue Share Split" },
                { key: "actions", label: "Master Actions" },
              ]}
              data={channels.map((c) => ({
                id: c.id,
                channel: (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-950 border border-slate-700 overflow-hidden flex-shrink-0 flex items-center justify-center text-slate-500 font-bold">
                      {c.logoUrl ? (
                        <img src={c.logoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Tv className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-white text-xs flex items-center gap-1">
                        <span>{c.title}</span>
                        {c.verified && (
                          <BadgeCheck className="w-3.5 h-3.5 text-cyan-400 fill-cyan-950 inline" title="Verified Channel" />
                        )}
                        {c.featured && (
                          <span className="p-0.5 text-[10px] text-amber-300 bg-amber-950/60 border border-amber-800 rounded font-semibold flex items-center gap-0.5">
                            <Star className="w-2.5 h-2.5 fill-amber-300" /> Featured
                          </span>
                        )}
                      </div>
                      <div className="text-cyan-400 text-[11px] font-mono">{c.handle}</div>
                      <div className="text-slate-500 text-[10px] font-mono">{c.id}</div>
                    </div>
                  </div>
                ),
                type: (
                  <div className="text-xs space-y-0.5">
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px] font-mono uppercase text-slate-300 font-semibold">
                      {c.type === "provider" ? `Provider (${c.providerId})` : "BQ Platform"}
                    </span>
                    <div className="text-slate-400 text-[11px] font-mono truncate max-w-[120px]">
                      Owner: {c.ownerUid}
                    </div>
                  </div>
                ),
                stats: (
                  <div className="text-xs space-y-0.5">
                    <div className="text-white font-medium flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-400" />
                      <span>{c.subscribersCount.toLocaleString()} subs</span>
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1">
                      <Film className="w-3 h-3 text-slate-400" />
                      <span>{c.videosCount} videos</span>
                    </div>
                  </div>
                ),
                status: (
                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-1">
                      {c.isLive ? (
                        <span className="px-1.5 py-0.5 bg-red-950 text-red-400 border border-red-800 rounded text-[10px] font-bold flex items-center gap-1">
                          <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE NOW
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Offline</span>
                      )}
                    </div>
                    <ConsoleStatusBadge
                      status={c.status === "SUSPENDED" ? "error" : c.status === "ACTIVE" ? "active" : "warning"}
                      label={c.status}
                    />
                  </div>
                ),
                revshare: (
                  <div className="text-xs">
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                        c.producerShareBps === 7000
                          ? "bg-slate-800 text-slate-300"
                          : "bg-amber-950/80 text-amber-300 border border-amber-800"
                      }`}
                    >
                      {c.producerSharePercent}% / {100 - c.producerSharePercent}%
                    </span>
                    {c.producerShareBps !== 7000 && (
                      <div className="text-[10px] text-amber-400 mt-0.5 font-semibold">Override Split</div>
                    )}
                  </div>
                ),
                actions: (
                  <div className="flex flex-wrap items-center gap-1 text-[11px]">
                    {/* Verify Badge Toggle */}
                    <button
                      onClick={() => {
                        setTargetChannelId(c.id);
                        setPendingAction(c.verified ? "unverify" : "verify");
                      }}
                      className={`p-1 border rounded ${
                        c.verified
                          ? "bg-cyan-950 hover:bg-cyan-900 border-cyan-800 text-cyan-300"
                          : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400"
                      }`}
                      title={c.verified ? "Revoke Verified Badge" : "Grant Verified Badge"}
                    >
                      <BadgeCheck className="w-3.5 h-3.5" />
                    </button>

                    {/* Suspend / Unsuspend */}
                    {c.status === "SUSPENDED" ? (
                      <button
                        onClick={() => {
                          setTargetChannelId(c.id);
                          setPendingAction("unsuspend");
                        }}
                        className="px-2 py-0.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded font-semibold"
                      >
                        Unsuspend
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setTargetChannelId(c.id);
                          setPendingAction("suspend");
                        }}
                        className="p-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded"
                        title="Suspend Channel"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Feature / Unfeature */}
                    <button
                      onClick={() => {
                        setTargetChannelId(c.id);
                        setPendingAction(c.featured ? "unfeature" : "feature");
                      }}
                      className={`p-1 border rounded ${
                        c.featured
                          ? "bg-amber-950 hover:bg-amber-900 border-amber-800 text-amber-300"
                          : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400"
                      }`}
                      title={c.featured ? "Remove from Featured" : "Feature on Homepage"}
                    >
                      <Star className={`w-3.5 h-3.5 ${c.featured ? "fill-amber-300" : ""}`} />
                    </button>

                    {/* Transfer Ownership */}
                    <button
                      onClick={() => {
                        setTransferTarget(c);
                        setNewOwnerUid("");
                        setTransferReason("");
                      }}
                      className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                      title="Transfer Channel Ownership"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>

                    {/* Change Handle */}
                    <button
                      onClick={() => {
                        setHandleTarget(c);
                        setNewHandle(c.handle.replace(/^@/, ""));
                        setHandleReason("");
                      }}
                      className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                      title="Change Channel Handle"
                    >
                      <AtSign className="w-3.5 h-3.5" />
                    </button>

                    {/* Revenue Share Split Override */}
                    <button
                      onClick={() => {
                        setRevShareTarget(c);
                        setSelectedShareBps(c.producerShareBps);
                        setRevShareReason("");
                      }}
                      className="p-1 bg-amber-950 hover:bg-amber-900 border border-amber-800 text-amber-300 rounded"
                      title="Set Revenue Share Override"
                    >
                      <Percent className="w-3.5 h-3.5" />
                    </button>

                    {/* Toggle Live Permission */}
                    <button
                      onClick={() => {
                        setTargetChannelId(c.id);
                        setPendingAction(c.liveStreamingAllowed ? "disable_live" : "enable_live");
                      }}
                      className={`p-1 border rounded ${
                        c.liveStreamingAllowed
                          ? "bg-emerald-950 border-emerald-800 text-emerald-300"
                          : "bg-slate-800 border-slate-700 text-slate-500"
                      }`}
                      title={c.liveStreamingAllowed ? "Live Streaming Allowed (Click to disable)" : "Live Streaming Disabled (Click to enable)"}
                    >
                      <Radio className="w-3.5 h-3.5" />
                    </button>

                    {/* Soft Delete / Restore */}
                    {c.status === "DELETED" ? (
                      <button
                        onClick={() => {
                          setTargetChannelId(c.id);
                          setPendingAction("restore");
                        }}
                        className="p-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded"
                        title="Restore Channel"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setTargetChannelId(c.id);
                          setPendingAction("delete");
                        }}
                        className="p-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 rounded"
                        title="Soft Delete Channel (30-day restore)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ),
              }))}
            />
          )}
        </ConsoleCard>

        {/* Modal: Transfer Ownership */}
        {transferTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Transfer Channel Ownership</h3>
                </div>
                <button onClick={() => setTransferTarget(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-slate-300">
                Transferring <strong>{transferTarget.title}</strong> ({transferTarget.handle}). Current owner:{" "}
                <code className="text-cyan-300">{transferTarget.ownerUid}</code>.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">New Owner / Producer UID</label>
                  <input
                    type="text"
                    value={newOwnerUid}
                    onChange={(e) => setNewOwnerUid(e.target.value)}
                    placeholder="e.g. prd_018274a89b"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Audit Trail Reason (min 3 chars)</label>
                  <textarea
                    rows={2}
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="e.g. Acquired rights transfer / verified provider migration"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferTarget(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingAction || !newOwnerUid.trim() || transferReason.trim().length < 3}
                  onClick={async () => {
                    await executeAction(transferTarget.id, {
                      action: "transfer",
                      newOwnerUid: newOwnerUid.trim(),
                      reason: transferReason.trim(),
                    });
                  }}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded font-bold"
                >
                  {submittingAction ? "Transferring..." : "Execute Transfer"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Change Handle */}
        {handleTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <AtSign className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Change Channel Handle</h3>
                </div>
                <button onClick={() => setHandleTarget(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">New Handle (without @)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-mono">@</span>
                    <input
                      type="text"
                      value={newHandle}
                      onChange={(e) => setNewHandle(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""))}
                      className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Audit Reason (min 3 chars)</label>
                  <input
                    type="text"
                    value={handleReason}
                    onChange={(e) => setHandleReason(e.target.value)}
                    placeholder="e.g. Brand rebranding request"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setHandleTarget(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingAction || !newHandle.trim() || handleReason.trim().length < 3}
                  onClick={async () => {
                    await executeAction(handleTarget.id, {
                      action: "change_handle",
                      handle: `@${newHandle.trim()}`,
                      reason: handleReason.trim(),
                    });
                  }}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded font-bold"
                >
                  {submittingAction ? "Saving..." : "Update Handle"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Revenue Share Override */}
        {revShareTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Percent className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">Revenue Share Split Override</h3>
                </div>
                <button onClick={() => setRevShareTarget(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-slate-300">
                Set custom revenue share split for <strong>{revShareTarget.title}</strong>. Default is 70/30 (Producer 70%, Platform 30%).
              </p>

              <div className="space-y-3">
                <label className="block font-semibold text-slate-300">Select Producer / Platform Split:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "70 / 30 (Default)", bps: 7000 },
                    { label: "80 / 20 (Premium)", bps: 8000 },
                    { label: "85 / 15 (VIP Producer)", bps: 8500 },
                    { label: "50 / 50 (Equal Co-Pro)", bps: 5000 },
                    { label: "100 / 0 (Exclusive Direct)", bps: 10000 },
                  ].map((split) => (
                    <button
                      key={split.bps}
                      type="button"
                      onClick={() => setSelectedShareBps(split.bps)}
                      className={`p-2.5 rounded-lg border text-left font-mono font-bold transition-colors ${
                        selectedShareBps === split.bps
                          ? "bg-amber-950 border-amber-600 text-amber-300"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      {split.label}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Reason for override (min 3 chars)</label>
                  <input
                    type="text"
                    value={revShareReason}
                    onChange={(e) => setRevShareReason(e.target.value)}
                    placeholder="e.g. Contract amendment VIP producer tier"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRevShareTarget(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingAction || revShareReason.trim().length < 3}
                  onClick={async () => {
                    await executeAction(revShareTarget.id, {
                      action: "rev_share",
                      shareBps: selectedShareBps,
                      reason: revShareReason.trim(),
                    });
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded font-bold"
                >
                  {submittingAction ? "Applying..." : "Save Split Override"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Mandatory Action Confirmation */}
        {pendingAction && targetChannelId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  Confirm {pendingAction.replace(/_/g, " ").toUpperCase()}
                </h3>
                <button onClick={() => setPendingAction(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-slate-300">
                You are executing <strong>{pendingAction}</strong> on channel <code>{targetChannelId}</code>.
              </p>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Reason (min 3 chars):</label>
                <textarea
                  rows={3}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Justification for audit trail..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingAction || actionReason.trim().length < 3}
                  onClick={async () => {
                    let reqAction = pendingAction;
                    const extra: Record<string, unknown> = {};

                    if (pendingAction === "verify") extra.verified = true;
                    if (pendingAction === "unverify") {
                      reqAction = "verify";
                      extra.verified = false;
                    }
                    if (pendingAction === "feature") extra.featured = true;
                    if (pendingAction === "unfeature") {
                      reqAction = "feature";
                      extra.featured = false;
                    }
                    if (pendingAction === "enable_live") {
                      reqAction = "toggle_live";
                      extra.allowed = true;
                    }
                    if (pendingAction === "disable_live") {
                      reqAction = "toggle_live";
                      extra.allowed = false;
                    }

                    await executeAction(targetChannelId, {
                      action: reqAction,
                      reason: actionReason.trim(),
                      ...extra,
                    });
                  }}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded font-bold"
                >
                  {submittingAction ? "Processing..." : "Confirm & Execute"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Zillionaire Channel Wizard (Batch N17) */}
        {isWizardOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6 space-y-5 shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Tv className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Create Channel Wizard</h3>
                </div>
                <button
                  onClick={() => setIsWizardOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Wizard Steps Stepper */}
              <div className="grid grid-cols-4 gap-2 text-center border-b border-slate-800 pb-3">
                {[
                  { step: 1, label: "1. Info" },
                  { step: 2, label: "2. Partner" },
                  { step: 3, label: "3. Commercials" },
                  { step: 4, label: "4. Review" },
                ].map(({ step, label }) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => setWizardStep(step as any)}
                    className={`py-1.5 rounded-lg font-bold text-xs transition ${
                      wizardStep === step
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                        : wizardStep > step
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {wizardError && (
                <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{wizardError}</span>
                </div>
              )}

              {/* STEP 1: CHANNEL INFO */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Channel Title *</label>
                    <input
                      type="text"
                      value={wizardForm.title}
                      onChange={(e) => setWizardForm({ ...wizardForm, title: e.target.value })}
                      placeholder="e.g. Action Cinema TV"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Category</label>
                      <select
                        value={wizardForm.category}
                        onChange={(e) => setWizardForm({ ...wizardForm, category: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                      >
                        <option value="Entertainment">Entertainment</option>
                        <option value="Movies">Movies</option>
                        <option value="Series">Series</option>
                        <option value="News">News</option>
                        <option value="Sports">Sports</option>
                        <option value="Music">Music</option>
                        <option value="Kids">Kids</option>
                        <option value="Documentary">Documentary</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Custom Slug (optional)</label>
                      <input
                        type="text"
                        value={wizardForm.customSlug}
                        onChange={(e) => setWizardForm({ ...wizardForm, customSlug: e.target.value })}
                        placeholder="e.g. action-cinema-tv"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Description / Tagline</label>
                    <textarea
                      rows={2}
                      value={wizardForm.description}
                      onChange={(e) => setWizardForm({ ...wizardForm, description: e.target.value })}
                      placeholder="Channel programming scope and target audience..."
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Age Content Rating</label>
                      <select
                        value={wizardForm.contentRating}
                        onChange={(e) =>
                          setWizardForm({
                            ...wizardForm,
                            contentRating: e.target.value as any,
                            adultOnly: e.target.value === "18+",
                          })
                        }
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                      >
                        <option value="G">G - General</option>
                        <option value="PG">PG - Parental Guidance</option>
                        <option value="13+">13+ - Teens</option>
                        <option value="16+">16+ - Mature</option>
                        <option value="18+">18+ - Adult Only</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Broadcast Language</label>
                      <input
                        type="text"
                        value={wizardForm.language}
                        onChange={(e) => setWizardForm({ ...wizardForm, language: e.target.value })}
                        placeholder="en"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-3">
                    <button
                      type="button"
                      disabled={!wizardForm.title.trim()}
                      onClick={() => setWizardStep(2)}
                      className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1.5"
                    >
                      Next: Partner Assignment
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: PARTNER ASSIGNMENT */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="p-3 bg-cyan-950/40 border border-cyan-800/40 rounded-xl space-y-1">
                    <h4 className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      Partner Governance & Domain Enforcement
                    </h4>
                    <p className="text-[11px] text-slate-300">
                      Free-mail providers (Gmail, Yahoo, Outlook, etc.) are strictly rejected for partner accounts. Use official company domains.
                    </p>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Partner Company Name</label>
                    <input
                      type="text"
                      value={wizardForm.partnerCompanyName}
                      onChange={(e) => setWizardForm({ ...wizardForm, partnerCompanyName: e.target.value })}
                      placeholder="e.g. Apex Media Networks Ltd"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Partner Company Email *</label>
                    <input
                      type="email"
                      value={wizardForm.partnerEmail}
                      onChange={(e) => setWizardForm({ ...wizardForm, partnerEmail: e.target.value })}
                      placeholder="e.g. distribution@apexmedia.tv"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Must use an official corporate domain. Personal emails are rejected.
                    </p>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Partner Role Assignment</label>
                    <select
                      value={wizardForm.partnerRole}
                      onChange={(e) => setWizardForm({ ...wizardForm, partnerRole: e.target.value as any })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    >
                      <option value="Manager">Manager (Full stream & content management)</option>
                      <option value="Editor">Editor (Schedules and metadata only)</option>
                      <option value="Viewer">Viewer (Read-only analytics)</option>
                    </select>
                  </div>

                  <div className="flex justify-between pt-3">
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg font-semibold"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardStep(3)}
                      className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold flex items-center gap-1.5"
                    >
                      Next: Commercials
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: DISTRIBUTION & COMMERCIALS */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Monetization Mode</label>
                      <select
                        value={wizardForm.paid ? "paid" : "free"}
                        onChange={(e) => setWizardForm({ ...wizardForm, paid: e.target.value === "paid" })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                      >
                        <option value="free">Free Access (Ad-supported / Promo)</option>
                        <option value="paid">Pay Per Minute Commercial</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Billing Currency</label>
                      <select
                        value={wizardForm.currency}
                        onChange={(e) => setWizardForm({ ...wizardForm, currency: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="NGN">NGN (₦)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="ZAR">ZAR (R)</option>
                        <option value="KES">KES (KSh)</option>
                        <option value="GHS">GHS (GH₵)</option>
                      </select>
                    </div>
                  </div>

                  {wizardForm.paid && (
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        Rate per Minute (Minor Units, e.g. 25 = $0.25)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={wizardForm.ratePerMinuteMinor}
                        onChange={(e) =>
                          setWizardForm({ ...wizardForm, ratePerMinuteMinor: parseInt(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                      />
                    </div>
                  )}

                  <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl space-y-2">
                    <label className="block font-semibold text-amber-300">
                      Hidden Partner Revenue Share Split (% of Net Revenue)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={wizardForm.revenueShareBps / 100}
                        onChange={(e) =>
                          setWizardForm({
                            ...wizardForm,
                            revenueShareBps: Math.min(10000, Math.max(0, (parseFloat(e.target.value) || 0) * 100)),
                          })
                        }
                        className="w-24 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-sm"
                      />
                      <span className="text-slate-400 font-mono text-sm">%</span>
                      <span className="text-[11px] text-slate-400">
                        ({wizardForm.revenueShareBps} bps). Hidden from public viewer responses.
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between pt-3">
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg font-semibold"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardStep(4)}
                      className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold flex items-center gap-1.5"
                    >
                      Next: Confirmation & Audit
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: CONFIRMATION & MANDATORY AUDIT REASON */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <h4 className="font-bold text-white text-sm">Review Channel Details</h4>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                      <div>
                        <span className="text-slate-500 block">Title</span>
                        <strong className="text-white">{wizardForm.title}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Category</span>
                        <span>{wizardForm.category}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Partner Email</span>
                        <span className="font-mono text-cyan-300">
                          {wizardForm.partnerEmail || "Unassigned"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Revenue Share</span>
                        <span className="font-mono">{wizardForm.revenueShareBps / 100}%</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Mandatory Audit Reason (min 3 chars) *
                    </label>
                    <textarea
                      rows={2}
                      value={wizardForm.reason}
                      onChange={(e) => setWizardForm({ ...wizardForm, reason: e.target.value })}
                      placeholder="e.g. Channel onboarding approval for international content partner"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    />
                  </div>

                  <div className="flex justify-between pt-3">
                    <button
                      type="button"
                      onClick={() => setWizardStep(3)}
                      className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg font-semibold"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={wizardSubmitting || wizardForm.reason.trim().length < 3}
                      onClick={handleCreateChannelSubmit}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-2 shadow-lg"
                    >
                      {wizardSubmitting ? "Creating Channel..." : "Authorize & Create Channel"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </ConsoleShell>
  );
}
