import { useEffect, useState, useMemo, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Inbox,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCheck,
  Tv,
  CreditCard,
  Radio,
  ShieldAlert,
  Megaphone,
  FileText,
  Search,
  Filter,
  Download,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  UserPlus,
  Play,
  Film,
  Layers,
  Image as ImageIcon,
  Edit3,
  ShieldCheck,
} from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/approvals")({
  component: ApprovalsRoute,
  head: () => ({
    meta: [
      { title: "Approvals Inbox | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ApprovalsRoute() {
  return (
    <ConsolePageGuard role="zillionaire">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Approvals Inbox"
          tagline="Unified decision queue for video, episode, live stream, artwork, channel, provider, payout, and moderation reviews"
          activePath="/zillionaire/approvals"
          account={{
            email: account.email || undefined,
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          onLock={onLock}
        >
          <ApprovalsInboxBody token={token} account={account} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}

export type ApprovalType =
  | "video"
  | "episode"
  | "channel"
  | "live_stream"
  | "artwork"
  | "ad_creative"
  | "producer"
  | "provider"
  | "payout"
  | "content_report"
  | "legal_issue";

export type ApprovalItem = {
  id: string;
  itemType: ApprovalType;
  rawId: string;
  title: string;
  submitterUid: string;
  submitterName: string;
  submitterEmail?: string;
  submittedAt: string;
  slaDeadline: string;
  slaHours: number;
  isOverdue: boolean;
  status: "pending" | "approved" | "rejected" | "changes_requested";
  assignedTo: string | null;
  priority: "urgent" | "high" | "medium" | "normal";
  details: Record<string, unknown>;
};

export type ApprovalsResponse = {
  items: ApprovalItem[];
  counts: {
    total: number;
    pending: number;
    changes_requested: number;
    approved: number;
    rejected: number;
    overdue: number;
    urgent: number;
  };
};

function formatSla(slaDeadline: string): { label: string; urgent: boolean; overdue: boolean } {
  const diffMs = new Date(slaDeadline).getTime() - Date.now();
  if (diffMs <= 0) {
    const overdueHrs = Math.abs(Math.round(diffMs / 3600000));
    return { label: `${overdueHrs}h overdue`, urgent: true, overdue: true };
  }
  const diffHrs = Math.round(diffMs / 3600000);
  if (diffHrs < 4) {
    return { label: `${diffHrs}h remaining`, urgent: true, overdue: false };
  }
  return { label: `${diffHrs}h SLA`, urgent: false, overdue: false };
}

function exportCsv(items: ApprovalItem[]) {
  if (items.length === 0) return;
  const headers = [
    "ID",
    "Type",
    "Title",
    "Submitter",
    "Status",
    "Submitted At",
    "SLA Deadline",
    "Overdue",
  ];
  const rows = items.map((i) => [
    i.id,
    i.itemType,
    `"${i.title.replace(/"/g, '""')}"`,
    `"${i.submitterName.replace(/"/g, '""')}"`,
    i.status,
    i.submittedAt,
    i.slaDeadline,
    i.isOverdue ? "YES" : "NO",
  ]);
  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `bq-squad-approvals-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const REJECTION_REASONS = [
  { code: "copyright_suspected", label: "Suspected Copyright Infringement" },
  { code: "duplicate", label: "Duplicate of Existing Catalog Video" },
  { code: "wrong_age_rating", label: "Inaccurate Age Rating / Missing Content Warnings" },
  { code: "poor_quality", label: "Audio/Video Quality Below Standard" },
  { code: "missing_proof", label: "Missing or Inadequate Proof of Rights" },
  { code: "policy_violation", label: "Platform Terms or Community Policy Violation" },
  { code: "other", label: "Other Rationale (Specify in notes)" },
];

function ApprovalsInboxBody({
  token,
  account,
}: {
  token: string;
  account: ConsoleAccount;
}) {
  const canReview =
    account.isOwner ||
    account.modules?.includes("content") ||
    account.modules?.includes("moderation");

  const [data, setData] = useState<ApprovalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal / Action state
  const [activeItem, setActiveItem] = useState<ApprovalItem | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [rejectionCode, setRejectionCode] = useState("other");
  const [assignedMember, setAssignedMember] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  const fetchItems = useCallback(
    async (isBackground = false) => {
      if (!canReview) return;
      if (isBackground) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const queryParams = new URLSearchParams();
        if (typeFilter !== "all") queryParams.set("type", typeFilter);
        if (statusFilter && statusFilter !== "all") queryParams.set("status", statusFilter);

        const res = await fetch(`/api/public/v1/zillionaire/approvals?${queryParams.toString()}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        if (!res.ok) throw new Error("Failed to fetch approvals queue.");
        const json = (await res.json()) as ApprovalsResponse;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading approvals.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, typeFilter, statusFilter, canReview],
  );

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    if (!searchQuery.trim()) return data.items;
    const q = searchQuery.toLowerCase();
    return data.items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.submitterName.toLowerCase().includes(q) ||
        item.rawId.toLowerCase().includes(q) ||
        (item.submitterEmail && item.submitterEmail.toLowerCase().includes(q)),
    );
  }, [data, searchQuery]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleDecision = async (
    action: "approve" | "reject" | "request_changes" | "assign",
    itemIds: string[],
  ) => {
    if (itemIds.length === 0) return;
    setActionBusy(true);
    setActionError("");
    setActionMessage("");

    try {
      const res = await fetch("/api/public/v1/zillionaire/approvals", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action,
          itemIds,
          notes: actionReason.trim(),
          reasonCode: action === "reject" ? rejectionCode : undefined,
          assignedTo: assignedMember.trim() || undefined,
        }),
      });

      const result = (await res.json()) as { error?: string; success?: boolean };
      if (!res.ok) throw new Error(result.error ?? "Failed to process decision.");

      setActionMessage(`Decision applied. Notification sent to submitter.`);
      setSelectedIds(new Set());
      setActionReason("");
      setActiveItem(null);
      await fetchItems(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionBusy(false);
    }
  };

  if (!canReview) {
    return (
      <div className="rounded-3xl border border-rose-500/30 bg-rose-950/20 p-12 text-center text-rose-200">
        <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-rose-400" />
        <h3 className="text-lg font-extrabold text-white">Content Review Permission Required</h3>
        <p className="mx-auto mt-2 max-w-md text-xs text-rose-200/80">
          Decisions on videos, episodes, live streams, artwork, and creative campaigns require the
          "Content review" (content) or moderation role on your account.
        </p>
      </div>
    );
  }

  const pendingCount = data?.counts.pending ?? 0;
  const changesCount = data?.counts.changes_requested ?? 0;
  const overdueCount = data?.counts.overdue ?? 0;
  const urgentCount = data?.counts.urgent ?? 0;

  return (
    <div className="space-y-6">
      {/* 1. Header & Welcome Banner */}
      <ConsoleWelcomeBanner
        badgeText="CENTRAL WORKFLOW & COMPLIANCE"
        title="Approvals Everywhere & Review Hub"
        description="Nothing goes public without approval: verify rights declarations, proof documents, age ratings, duplicate fingerprint results, and preview media before approving, requesting changes, or rejecting."
        actionLabel="Export Queue"
        onAction={() => exportCsv(filteredItems)}
        secondaryActionLabel={refreshing ? "Refreshing..." : "Refresh Queue"}
        onSecondaryAction={() => void fetchItems(true)}
      />

      {/* 2. KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <ConsoleKpiCard
          title="Pending Queue"
          value={pendingCount}
          subtitle="Awaiting reviewer decision"
          change={{ value: `${urgentCount} urgent priority`, positive: urgentCount === 0 }}
          icon={Inbox}
          variant="blue"
        />

        <ConsoleKpiCard
          title="Changes Requested"
          value={changesCount}
          subtitle="Returned to producer for revisions"
          change={{ value: "Awaiting creator update", positive: true }}
          icon={Edit3}
          variant="purple"
        />

        <ConsoleKpiCard
          title="Overdue SLAs"
          value={overdueCount}
          subtitle="Exceeded review deadline"
          change={{
            value: overdueCount > 0 ? "Urgent turnaround" : "On schedule",
            positive: overdueCount === 0,
          }}
          icon={Clock}
          variant="gold"
        />

        <ConsoleKpiCard
          title="Reviewed Total"
          value={(data?.counts.approved ?? 0) + (data?.counts.rejected ?? 0)}
          subtitle="Approved or rejected in ledger"
          change={{ value: "Audited decisions", positive: true }}
          icon={CheckCircle2}
          variant="green"
        />
      </div>

      {/* 3. Filter Navigation & Bulk Actions Bar */}
      <div className="rounded-2xl border border-blue-900/30 bg-[#071126]/90 p-4 shadow-lg backdrop-blur space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Category Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All Items" },
              { id: "video", label: "Videos / Movies", icon: Film },
              { id: "episode", label: "Episodes", icon: Layers },
              { id: "live_stream", label: "Live Streams", icon: Radio },
              { id: "artwork", label: "Artwork", icon: ImageIcon },
              { id: "channel", label: "Channels", icon: Tv },
              { id: "ad_creative", label: "Ad Creatives", icon: Megaphone },
              { id: "producer", label: "Producers", icon: UserCheck },
              { id: "provider", label: "Providers", icon: Radio },
              { id: "payout", label: "Payouts", icon: CreditCard },
              { id: "content_report", label: "Reports", icon: ShieldAlert },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setTypeFilter(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    typeFilter === tab.id
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                      : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Status Selector */}
          <div className="flex items-center gap-1 rounded-xl bg-black/40 border border-white/5 p-1">
            {[
              { id: "all", label: "All" },
              { id: "pending", label: "Pending" },
              { id: "changes_requested", label: "Changes" },
              { id: "approved", label: "Approved" },
              { id: "rejected", label: "Rejected" },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition ${
                  statusFilter === s.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search & Bulk Action Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/5">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by title, producer, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-white/10 bg-[#040b1c] text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400"
            />
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <span className="text-xs font-bold text-cyan-300">{selectedIds.size} selected</span>
              <button
                onClick={() => {
                  setActiveItem({
                    id: "bulk",
                    itemType: "video",
                    rawId: "bulk",
                    title: `Bulk Review (${selectedIds.size} items)`,
                    submitterUid: "multiple",
                    submitterName: "Multiple Submitters",
                    submittedAt: new Date().toISOString(),
                    slaDeadline: new Date().toISOString(),
                    slaHours: 24,
                    isOverdue: false,
                    status: "pending",
                    assignedTo: null,
                    priority: "high",
                    details: {},
                  });
                }}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-extrabold shadow transition"
              >
                Review Bulk ({selectedIds.size})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Approvals Table */}
      <ConsoleCard
        title="Review Queue"
        subtitle={`Showing ${filteredItems.length} review items`}
        headerAction={
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="text-[11px] font-bold text-slate-400 hover:text-white transition"
            >
              {selectedIds.size === filteredItems.length && filteredItems.length > 0
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>
        }
      >
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading review queue...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
            <p className="text-sm font-bold text-white">Review Queue is Clear</p>
            <p className="text-xs text-slate-400">
              No items require decision under the selected filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-white/10 bg-white/[0.02] text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-3 w-8">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Title & Asset</th>
                  <th className="py-3 px-3">Submitter / Producer</th>
                  <th className="py-3 px-3">Rights & Fingerprint</th>
                  <th className="py-3 px-3">SLA Status</th>
                  <th className="py-3 px-3">Submitted</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredItems.map((item) => {
                  const sla = formatSla(item.slaDeadline);
                  const isSelected = selectedIds.has(item.id);
                  const dup = item.details?.duplicateResult as
                    | Record<string, unknown>
                    | undefined;
                  const isDup = dup?.duplicateDetected === true;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-white/[0.02] transition ${
                        isSelected ? "bg-blue-600/[0.06]" : ""
                      }`}
                    >
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item.id)}
                          className="rounded border-white/20 bg-black/40 text-blue-600 focus:ring-0"
                        />
                      </td>

                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/5 text-slate-300 border border-white/10">
                          {item.itemType.replace("_", " ")}
                        </span>
                      </td>

                      <td className="py-3 px-3 min-w-[200px]">
                        <p className="font-bold text-white truncate max-w-md">{item.title}</p>
                        <p className="text-[10px] text-slate-400 truncate">ID: {item.rawId}</p>
                      </td>

                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-200">{item.submitterName}</p>
                        {item.submitterEmail && (
                          <p className="text-[10px] text-slate-400">{item.submitterEmail}</p>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {isDup ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Possible Duplicate</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <ShieldCheck className="h-3 w-3" />
                            <span>Unique Master</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            sla.overdue
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : sla.urgent
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          <span>{sla.label}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        {new Date(item.submittedAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => {
                            setActiveItem(item);
                            setActionReason("");
                            setRejectionCode("other");
                            setActionError("");
                            setActionMessage("");
                          }}
                          className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-cyan-300 hover:text-white border border-blue-500/30 text-xs font-bold transition flex items-center gap-1 ml-auto"
                        >
                          <span>Review</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ConsoleCard>

      {/* 5. Comprehensive Review & Decision Modal */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-3xl border border-blue-500/40 bg-[#07132e] p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/60 px-2.5 py-0.5 rounded-full border border-cyan-800/40">
                  {activeItem.id === "bulk"
                    ? "BULK REVIEW"
                    : activeItem.itemType.replace("_", " ").toUpperCase()}
                </span>
                <h3 className="text-base font-extrabold text-white mt-1.5">{activeItem.title}</h3>
                <p className="text-xs text-slate-400">
                  Submitter: {activeItem.submitterName} ({activeItem.submitterUid})
                </p>
              </div>
              <button
                onClick={() => setActiveItem(null)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            {/* Media Preview Player */}
            {activeItem.id !== "bulk" && activeItem.details?.previewPlayer && (
              <div className="rounded-2xl border border-white/10 bg-black/50 p-3 space-y-2">
                <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Play className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Media Preview</span>
                </p>
                {(() => {
                  const p = activeItem.details.previewPlayer as Record<string, unknown>;
                  const previewUrl = p.previewUrl ? String(p.previewUrl) : null;
                  const posterUrl = p.posterUrl ? String(p.posterUrl) : null;
                  const mediaKind = String(p.mediaKind || "video");

                  if (previewUrl && (mediaKind === "video" || mediaKind === "live_hls")) {
                    return (
                      <video
                        controls
                        src={previewUrl}
                        poster={posterUrl || undefined}
                        className="w-full max-h-60 rounded-xl bg-black border border-white/10"
                      />
                    );
                  }
                  if (previewUrl && mediaKind === "image") {
                    return (
                      <img
                        src={previewUrl}
                        alt="Creative preview"
                        className="w-full max-h-60 object-contain rounded-xl bg-black/60 border border-white/10"
                      />
                    );
                  }
                  if (posterUrl) {
                    return (
                      <img
                        src={posterUrl}
                        alt="Artwork poster"
                        className="w-full max-h-48 object-contain rounded-xl bg-black/60 border border-white/10"
                      />
                    );
                  }
                  return (
                    <div className="p-6 text-center text-xs text-slate-500 bg-white/[0.02] rounded-xl border border-white/5">
                      No direct preview stream available; check storage master.
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Declaration & Rights Proof */}
            {activeItem.id !== "bulk" && activeItem.details?.declaration && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-1.5">
                  <p className="font-bold text-slate-300">Rights Declaration:</p>
                  {(() => {
                    const d = activeItem.details.declaration as Record<string, unknown>;
                    return (
                      <div className="space-y-1 text-[11px]">
                        <div>
                          <span className="text-slate-500">License: </span>
                          <span className="text-slate-200 font-semibold">
                            {String(d.licenseType || "Commercial")}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Copyright Holder: </span>
                          <span className="text-slate-200">
                            {String(d.copyrightHolderName || "Producer")}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Production Year: </span>
                          <span className="text-slate-200">
                            {String(d.productionYear || new Date().getFullYear())}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-1.5">
                  <p className="font-bold text-slate-300">Proof of Rights:</p>
                  {(() => {
                    const pr = (activeItem.details.proofOfRights as Record<string, unknown>) || {};
                    const hasProof = pr.hasProof === true;
                    const path = pr.evidencePath ? String(pr.evidencePath) : null;
                    return (
                      <div className="space-y-1 text-[11px]">
                        <div>
                          <span className="text-slate-500">Evidence Status: </span>
                          <span
                            className={
                              hasProof ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"
                            }
                          >
                            {hasProof ? "Uploaded Proof on File" : "No Attachment"}
                          </span>
                        </div>
                        {path && (
                          <div className="truncate text-slate-400 font-mono text-[10px]">
                            {path}
                          </div>
                        )}
                        {(() => {
                          const age = (activeItem.details.ageLimit as Record<string, unknown>) || {};
                          return (
                            <div>
                              <span className="text-slate-500">Age Rating: </span>
                              <span className="text-cyan-300 font-bold">
                                {String(age.ageRating || "PG")}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Duplicate & Fingerprint Detection Alert */}
            {activeItem.id !== "bulk" && activeItem.details?.duplicateResult && (
              <div>
                {(() => {
                  const dup = activeItem.details.duplicateResult as Record<string, unknown>;
                  const isDup = dup.duplicateDetected === true;
                  return isDup ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
                      <p className="font-bold flex items-center gap-1.5 text-amber-300">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Possible Duplicate Detected</span>
                      </p>
                      <p className="text-[11px]">
                        Matched against:{" "}
                        <span className="font-bold text-white">
                          {String(dup.duplicateOfTitle || "Existing catalog title")}
                        </span>
                      </p>
                      <p className="text-[10px] text-amber-300/80 font-mono">
                        Flag: {String(dup.reviewQueueFlag || "Exact match")}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                      <div>
                        <p className="font-bold text-emerald-300">Unique Fingerprint Verified</p>
                        <p className="text-[10px] text-emerald-400/80">
                          {String(dup.reviewQueueFlag || "No copyright or duplicate flags.")}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Structured Rejection Code Selector (Only for reject) */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">
                Reason Code (Required for Rejection)
              </label>
              <select
                value={rejectionCode}
                onChange={(e) => setRejectionCode(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#030919] px-3 py-2 text-xs text-white outline-none focus:border-cyan-400"
              >
                {REJECTION_REASONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Decision Notes / Revision Instructions */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                Decision Notes / Revision Instructions / Audit Reason{" "}
                <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Explain the approval, requested changes, or rejection rationale (delivered to producer notification)..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#030919] p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400"
              />
            </div>

            {/* Assignee Input */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-400">
                Assign to Team Member (Optional UID or email)
              </label>
              <input
                type="text"
                placeholder="operator@bqsqwad.tv"
                value={assignedMember}
                onChange={(e) => setAssignedMember(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#030919] px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400"
              />
            </div>

            {actionError && (
              <p className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                {actionError}
              </p>
            )}

            {actionMessage && (
              <p className="text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                {actionMessage}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setActiveItem(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={actionBusy || actionReason.trim().length < 3 || !assignedMember.trim()}
                onClick={() =>
                  handleDecision(
                    "assign",
                    activeItem.id === "bulk" ? Array.from(selectedIds) : [activeItem.id],
                  )
                }
                className="px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-200 hover:text-white border border-blue-500/30 text-xs font-bold transition disabled:opacity-50"
              >
                Assign
              </button>

              <button
                type="button"
                disabled={actionBusy || actionReason.trim().length < 3}
                onClick={() =>
                  handleDecision(
                    "request_changes",
                    activeItem.id === "bulk" ? Array.from(selectedIds) : [activeItem.id],
                  )
                }
                className="px-3.5 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/30 text-xs font-bold transition disabled:opacity-50"
              >
                {actionBusy ? "Processing..." : "Request Changes"}
              </button>

              <button
                type="button"
                disabled={actionBusy || actionReason.trim().length < 3}
                onClick={() =>
                  handleDecision(
                    "reject",
                    activeItem.id === "bulk" ? Array.from(selectedIds) : [activeItem.id],
                  )
                }
                className="px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-bold transition disabled:opacity-50"
              >
                {actionBusy ? "Processing..." : "Reject with Reason"}
              </button>

              <button
                type="button"
                disabled={actionBusy || actionReason.trim().length < 3}
                onClick={() =>
                  handleDecision(
                    "approve",
                    activeItem.id === "bulk" ? Array.from(selectedIds) : [activeItem.id],
                  )
                }
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
              >
                {actionBusy ? "Processing..." : "Approve & Publish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
