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
    <ConsolePageGuard role="zillionaire" module="moderation">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Approvals Inbox"
          tagline="Unified decision queue for creator, channel, provider, payout, and moderation reviews"
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

type ApprovalType =
  | "channel"
  | "producer"
  | "provider"
  | "payout"
  | "content_report"
  | "ad_creative"
  | "legal_issue";

type ApprovalItem = {
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
  status: "pending" | "approved" | "rejected";
  assignedTo: string | null;
  priority: "urgent" | "high" | "medium" | "normal";
  details: Record<string, unknown>;
};

type ApprovalsResponse = {
  items: ApprovalItem[];
  counts: {
    total: number;
    pending: number;
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
  const headers = ["ID", "Type", "Title", "Submitter", "Status", "Submitted At", "SLA Deadline", "Overdue"];
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

function ApprovalsInboxBody({
  token,
  account,
}: {
  token: string;
  account: ConsoleAccount;
}) {
  const [data, setData] = useState<ApprovalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal / Action state
  const [activeItem, setActiveItem] = useState<ApprovalItem | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [assignedMember, setAssignedMember] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  const fetchItems = useCallback(
    async (isBackground = false) => {
      if (isBackground) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const queryParams = new URLSearchParams();
        if (typeFilter !== "all") queryParams.set("type", typeFilter);
        if (statusFilter) queryParams.set("status", statusFilter);

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
    [token, typeFilter, statusFilter],
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

  const handleDecision = async (action: "approve" | "reject" | "assign", itemIds: string[]) => {
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
          assignedTo: assignedMember.trim() || undefined,
        }),
      });

      const result = (await res.json()) as { error?: string; processedCount?: number };
      if (!res.ok) throw new Error(result.error ?? "Failed to process decision.");

      setActionMessage(`Successfully processed ${result.processedCount ?? itemIds.length} item(s).`);
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

  const pendingCount = data?.counts.pending ?? 0;
  const overdueCount = data?.counts.overdue ?? 0;
  const urgentCount = data?.counts.urgent ?? 0;

  return (
    <div className="space-y-6">
      {/* 1. Header & Welcome Banner */}
      <ConsoleWelcomeBanner
        badgeText="CENTRAL WORKFLOW ENGINE"
        title="Approvals Inbox & SLA Mission Control"
        description="Unified review queue for channel submissions, producer verifications, provider access requests, payout settlements, and moderation escalations."
        actionLabel="Export Queue"
        onAction={() => exportCsv(filteredItems)}
        secondaryActionLabel={refreshing ? "Refreshing..." : "Refresh Queue"}
        onSecondaryAction={() => void fetchItems(true)}
      />

      {/* 2. Three KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ConsoleKpiCard
          title="Pending Queue"
          value={pendingCount}
          subtitle="Items awaiting operator review"
          change={{ value: `${urgentCount} urgent priority`, positive: urgentCount === 0 }}
          icon={Inbox}
          variant="blue"
        />

        <ConsoleKpiCard
          title="Overdue SLAs"
          value={overdueCount}
          subtitle="Passed compliance turnaround deadline"
          change={{ value: overdueCount > 0 ? "Action required" : "On schedule", positive: overdueCount === 0 }}
          icon={Clock}
          variant="gold"
        />

        <ConsoleKpiCard
          title="Reviewed Total"
          value={(data?.counts.total ?? 0) - pendingCount}
          subtitle="Processed approvals & resolutions"
          change={{ value: "Audited in platform ledger", positive: true }}
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
              { id: "channel", label: "Channels" },
              { id: "producer", label: "Producers" },
              { id: "provider", label: "Providers" },
              { id: "payout", label: "Payouts" },
              { id: "content_report", label: "Content Reports" },
              { id: "ad_creative", label: "Ad Creatives" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTypeFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  typeFilter === tab.id
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Selector */}
          <div className="flex items-center gap-1 rounded-xl bg-black/40 border border-white/5 p-1">
            {(["pending", "approved", "rejected"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition ${
                  statusFilter === s
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {s}
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
              placeholder="Search by title, creator, or UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-white/10 bg-[#040b1c] text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400"
            />
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <span className="text-xs font-bold text-cyan-300">
                {selectedIds.size} selected
              </span>
              <button
                onClick={() => {
                  setActiveItem({
                    id: "bulk",
                    itemType: "channel",
                    rawId: "bulk",
                    title: `Bulk Action (${selectedIds.size} items)`,
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
        title="Pending Items"
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
          <div className="p-8 text-center text-xs text-slate-400">Loading approvals queue...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-bold text-white">Queue is clear</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No approval requests match the selected category and status filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 text-slate-400 text-[11px]">
                  <th className="py-2.5 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-white/20 bg-black/40 text-blue-600 focus:ring-0"
                    />
                  </th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Title & Item</th>
                  <th className="py-2.5 px-3">Submitter</th>
                  <th className="py-2.5 px-3">SLA Status</th>
                  <th className="py-2.5 px-3">Submitted</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredItems.map((item) => {
                  const sla = formatSla(item.slaDeadline);
                  const isSelected = selectedIds.has(item.id);

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
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/5 text-slate-300 border border-white/10">
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

      {/* 5. Review & Decision Modal */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-3xl border border-blue-500/30 bg-[#07132e] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/60 px-2.5 py-0.5 rounded-full border border-cyan-800/40">
                  {activeItem.id === "bulk" ? "BULK REVIEW" : activeItem.itemType.replace("_", " ").toUpperCase()}
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

            {/* Metadata / Details */}
            {activeItem.id !== "bulk" && (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs space-y-2">
                <p className="font-bold text-slate-300">Submission Details:</p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {Object.entries(activeItem.details).map(([k, v]) => (
                    <div key={k} className="truncate">
                      <span className="text-slate-500 uppercase font-semibold">{k}: </span>
                      <span className="text-slate-200">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Decision Notes Input */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                Decision Notes / Audit Reason <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Explain the approval or rejection rationale (required for audit trail)..."
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
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setActiveItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
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
                className="px-4 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-200 hover:text-white border border-blue-500/30 text-xs font-bold transition disabled:opacity-50"
              >
                {actionBusy ? "Processing..." : "Assign"}
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
                className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-bold transition disabled:opacity-50"
              >
                {actionBusy ? "Processing..." : "Reject"}
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
                {actionBusy ? "Processing..." : "Approve & Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
