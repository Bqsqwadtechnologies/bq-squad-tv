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
  ShieldAlert,
  ShieldCheck,
  Search,
  RotateCcw,
  Film,
  AlertTriangle,
  FileCheck,
  Clock,
  ExternalLink,
  X,
  CheckCircle2,
  Copy,
  Layers,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/rights-review")({
  component: ZillionaireRightsReviewRoute,
  head: () => ({
    meta: [
      { title: "Rights Review & Copyright Queue | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface RightsReviewItem {
  assetId: string;
  title: string;
  channelId: string | null;
  ownerUid: string | null;
  ownerName: string | null;
  status: string;
  contentStatus: string;
  rightsReviewStatus: string;
  fileHash: string | null;
  perceptualFingerprint: string | null;
  checksumSha256: string | null;
  duplicateDetected: boolean;
  duplicateOfAssetId: string | null;
  duplicateOfTitle: string | null;
  duplicateType: "exact" | "near_duplicate" | null;
  reviewQueueFlag: string | null;
  matchedAsset?: {
    assetId: string;
    title: string;
    channelId: string | null;
    ownerUid: string | null;
    contentStatus: string | null;
    posterUrl: string | null;
    createdAt: string | null;
  } | null;
  license?: {
    licenseType?: string;
    copyrightHolderName?: string;
    productionYear?: number;
    evidencePath?: string;
    status?: string;
    reviewReason?: string;
  } | null;
  ageRating?: string | null;
  contentWarnings?: string[];
  language?: string | null;
  genre?: string | null;
  rejectionReasonCode?: string | null;
  rejectionReasonLabel?: string | null;
  rejectionMessage?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  appealSubmitted: boolean;
  appealSubmittedAt?: string | null;
  appealExplanation?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface ReasonCodeOption {
  code: string;
  label: string;
}

function ZillionaireRightsReviewRoute() {
  return (
    <ConsolePageGuard role="zillionaire">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Rights Review & Copyright Queue"
          tagline="Independent review of broadcast rights, perceptual fingerprints, duplicate detection and creator appeals"
          activePath="/zillionaire/rights-review"
          account={{
            email: account.email || undefined,
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          onLock={onLock}
        >
          <RightsReviewContent token={token} account={account} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}

function RightsReviewContent({
  token,
  account,
}: {
  token: string;
  account: { email?: string; isOwner: boolean; modules: string[] };
}) {
  const [items, setItems] = useState<RightsReviewItem[]>([]);
  const [reasonCodes, setReasonCodes] = useState<ReasonCodeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "duplicates" | "appealed" | "pending" | "resolved"
  >("all");

  // Action modal
  const [selectedItem, setSelectedItem] = useState<RightsReviewItem | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject">("approve");
  const [actionReason, setActionReason] = useState("");
  const [actionReasonCode, setActionReasonCode] = useState("other");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Comparison modal
  const [compareItem, setCompareItem] = useState<RightsReviewItem | null>(null);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/public/v1/zillionaire/rights-review?filter=${encodeURIComponent(statusFilter)}`,
        {
          headers: await getWebAuthHeaders(token),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load rights review queue.");
      }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      if (Array.isArray(data.reasonCodes)) setReasonCodes(data.reasonCodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.assetId.toLowerCase().includes(q) ||
        (item.channelId && item.channelId.toLowerCase().includes(q)) ||
        (item.duplicateOfTitle && item.duplicateOfTitle.toLowerCase().includes(q)),
    );
  }, [items, searchQuery]);

  const kpis = useMemo(() => {
    const total = items.length;
    const duplicates = items.filter((i) => i.duplicateDetected).length;
    const appeals = items.filter((i) => i.appealSubmitted).length;
    const pending = items.filter(
      (i) => i.rightsReviewStatus === "pending" || i.rightsReviewStatus === "flagged",
    ).length;
    return { total, duplicates, appeals, pending };
  }, [items]);

  async function handleActionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem) return;
    if (actionReason.trim().length < 3) {
      setActionError("Reviewer reason must be at least 3 characters.");
      return;
    }
    setActionSubmitting(true);
    setActionError("");
    setActionSuccess("");

    try {
      const res = await fetch("/api/public/v1/zillionaire/rights-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getWebAuthHeaders(token)),
        },
        body: JSON.stringify({
          assetId: selectedItem.assetId,
          action: actionType,
          reason: actionReason.trim(),
          ...(actionType === "reject" ? { reasonCode: actionReasonCode } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed.");

      setActionSuccess(
        actionType === "approve"
          ? "Rights verified and approved."
          : "Upload rejected with reason code and notice dispatched.",
      );

      setTimeout(() => {
        setSelectedItem(null);
        setActionReason("");
        setActionSuccess("");
        loadData();
      }, 1200);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <ConsoleWelcomeBanner
        title="Rights Review & Copyright Queue"
        description="Verify chain-of-title, inspect frame perceptual fingerprints, resolve possible duplicates, and process producer appeals before broadcast."
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <ConsoleKpiCard
          title="In Review Queue"
          value={kpis.total}
          icon={ShieldCheck}
          badge={{ text: "Active", variant: "info" }}
        />
        <ConsoleKpiCard
          title="Possible Duplicates"
          value={kpis.duplicates}
          icon={Layers}
          badge={{ text: "Perceptual Match", variant: "warning" }}
        />
        <ConsoleKpiCard
          title="Producer Appeals"
          value={kpis.appeals}
          icon={AlertTriangle}
          badge={{ text: "Priority", variant: "error" }}
        />
        <ConsoleKpiCard
          title="Pending Decisions"
          value={kpis.pending}
          icon={Clock}
          badge={{ text: "Needs Action", variant: "default" }}
        />
      </div>

      {/* Filters and Search */}
      <ConsoleCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "all", label: "All Items" },
              { id: "duplicates", label: "Flagged Duplicates" },
              { id: "appealed", label: "Appeals" },
              { id: "pending", label: "Pending" },
              { id: "resolved", label: "Resolved" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  statusFilter === tab.id
                    ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, asset, channel..."
                className="w-56 rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </ConsoleCard>

      {/* Error display */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-medium text-rose-300">
          {error}
        </div>
      )}

      {/* Main Review Table */}
      <ConsoleCard>
        <div className="overflow-x-auto">
          <ConsoleTable>
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="p-3">Video / Asset</th>
                <th className="p-3">Channel / Owner</th>
                <th className="p-3">Rights & Fingerprint</th>
                <th className="p-3">Review Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    Loading rights review queue...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    No videos found matching the selected filter.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.assetId} className="hover:bg-white/[0.02] transition">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-300">
                          <Film className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold text-white line-clamp-1">{item.title}</p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="font-mono">{item.assetId.slice(0, 16)}...</span>
                            {item.ageRating && (
                              <span className="rounded bg-white/10 px-1 py-0.5 text-[10px] font-bold text-cyan-300">
                                {item.ageRating}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-3">
                      <p className="font-semibold text-white">
                        {item.channelId || "Platform Upload"}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {item.ownerUid ? `${item.ownerUid.slice(0, 12)}...` : "System"}
                      </p>
                    </td>

                    <td className="p-3">
                      <div className="space-y-1">
                        {item.duplicateDetected ? (
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                              {item.reviewQueueFlag || `Possible duplicate of ${item.duplicateOfTitle || "Existing Video"}`}
                            </span>
                            {item.matchedAsset && (
                              <button
                                onClick={() => setCompareItem(item)}
                                className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300 hover:bg-white/20"
                              >
                                Compare
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            Unique Fingerprint
                          </span>
                        )}

                        <div className="text-[11px] text-slate-400">
                          <span>Licence: </span>
                          <span className="text-white font-medium">
                            {item.license?.licenseType || "Standard"}
                          </span>
                          {item.license?.copyrightHolderName && (
                            <span className="text-slate-400">
                              {" "}
                              • {item.license.copyrightHolderName}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="space-y-1">
                        {item.appealSubmitted ? (
                          <span className="rounded-lg bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                            Appeal Pending
                          </span>
                        ) : item.rightsReviewStatus === "verified" ? (
                          <span className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            Rights Verified
                          </span>
                        ) : item.rightsReviewStatus === "rejected" ||
                          item.rejectionReasonCode ? (
                          <span className="rounded-lg bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                            Rejected: {item.rejectionReasonLabel || item.rejectionReasonCode}
                          </span>
                        ) : (
                          <span className="rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                            Awaiting Review
                          </span>
                        )}

                        {item.appealSubmitted && item.appealExplanation && (
                          <p className="text-[10px] text-purple-200 line-clamp-1 italic">
                            "{item.appealExplanation}"
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedItem(item);
                            setActionType("approve");
                            setActionReason("All rights documentation verified and approved.");
                            setActionError("");
                          }}
                          className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(item);
                            setActionType("reject");
                            setActionReason("");
                            setActionReasonCode("copyright_suspected");
                            setActionError("");
                          }}
                          className="rounded-lg bg-rose-500/15 border border-rose-500/30 px-2.5 py-1 text-xs font-bold text-rose-300 hover:bg-rose-500/25 transition"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </ConsoleTable>
        </div>
      </ConsoleCard>

      {/* MODAL: ACTION (APPROVE / REJECT) */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#07143d] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white">
                {actionType === "approve"
                  ? "Approve Rights & Clearance"
                  : "Reject Upload & Provide Reason"}
              </h3>
              <button
                onClick={() => setSelectedItem(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-white/5 p-3.5 space-y-1 text-xs">
              <p className="font-bold text-white">{selectedItem.title}</p>
              <p className="text-slate-400 font-mono text-[11px]">ID: {selectedItem.assetId}</p>
              {selectedItem.duplicateDetected && (
                <p className="text-amber-300 font-semibold">
                  ⚠️ {selectedItem.reviewQueueFlag || "Flagged duplicate match"}
                </p>
              )}
              {selectedItem.appealSubmitted && (
                <div className="mt-2 rounded-xl bg-purple-950/40 border border-purple-500/20 p-2.5 text-purple-200">
                  <span className="font-bold text-purple-300">Producer appeal note: </span>
                  {selectedItem.appealExplanation}
                </div>
              )}
            </div>

            {actionError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 font-medium">
                {actionError}
              </div>
            )}
            {actionSuccess && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 font-medium">
                {actionSuccess}
              </div>
            )}

            <form onSubmit={handleActionSubmit} className="space-y-4">
              {actionType === "reject" && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Rejection Reason Code *
                  </label>
                  <select
                    value={actionReasonCode}
                    onChange={(e) => setActionReasonCode(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white focus:border-rose-400 focus:outline-none"
                  >
                    {reasonCodes.map((rc) => (
                      <option key={rc.code} value={rc.code}>
                        {rc.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Reviewer Notes / Message to Producer *
                </label>
                <textarea
                  rows={3}
                  required
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={
                    actionType === "approve"
                      ? "Enter verification notes for the audit ledger..."
                      : "Enter a clear plain-language explanation shown to the producer..."
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionSubmitting || !actionReason.trim()}
                  className={`rounded-xl px-5 py-2 text-xs font-bold text-white transition disabled:opacity-50 ${
                    actionType === "approve"
                      ? "bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
                      : "bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/20"
                  }`}
                >
                  {actionSubmitting
                    ? "Processing..."
                    : actionType === "approve"
                      ? "Confirm Approval"
                      : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DUPLICATE COMPARISON */}
      {compareItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-amber-500/30 bg-[#07143d] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
                  <Layers className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-white">Perceptual Duplicate Comparison</h3>
              </div>
              <button
                onClick={() => setCompareItem(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Candidate Upload */}
              <div className="rounded-2xl border border-cyan-400/30 bg-cyan-950/20 p-4 space-y-2">
                <span className="rounded bg-cyan-400/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300 uppercase">
                  Candidate Upload
                </span>
                <p className="font-bold text-white text-sm">{compareItem.title}</p>
                <p className="text-slate-400 font-mono text-[11px]">ID: {compareItem.assetId}</p>
                <p className="text-slate-300">
                  <span className="text-slate-400">Channel: </span>
                  {compareItem.channelId || "Direct"}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-400">Licence: </span>
                  {compareItem.license?.licenseType || "Standard"}
                </p>
                <p className="text-slate-300 font-mono text-[10px] break-all">
                  <span className="text-slate-400">Fingerprint: </span>
                  {compareItem.perceptualFingerprint || "Not available"}
                </p>
              </div>

              {/* Matched Original Video */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-2">
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase">
                  Existing Match in Catalogue
                </span>
                <p className="font-bold text-white text-sm">
                  {compareItem.matchedAsset?.title || compareItem.duplicateOfTitle || "Existing Video"}
                </p>
                <p className="text-slate-400 font-mono text-[11px]">
                  ID: {compareItem.duplicateOfAssetId}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-400">Channel: </span>
                  {compareItem.matchedAsset?.channelId || "Original Producer"}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-400">Status: </span>
                  <span className="text-emerald-400 font-semibold">
                    {compareItem.matchedAsset?.contentStatus || "Published"}
                  </span>
                </p>
                <p className="text-amber-200 text-[11px]">
                  Rule: A video cannot be published twice by different producers. Rejection or
                  authorisation required.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
              <button
                onClick={() => setCompareItem(null)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
