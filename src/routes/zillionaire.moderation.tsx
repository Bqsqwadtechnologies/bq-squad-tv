import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import {
  MessageSquare,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  EyeOff,
  Ban,
  Ghost,
  Check,
  X,
  Plus,
  Search,
  Filter,
  Star,
  ToggleLeft,
  ToggleRight,
  Flag,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/moderation")({
  component: ZillionaireModerationRoute,
  head: () => ({
    meta: [
      { title: "Moderation & Community Safety | Zillionaire Control" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface CommentItem {
  id: string;
  assetId: string;
  authorUid: string;
  viewerNumber: string;
  body: string;
  status: string;
  flaggedKeywords: string[];
  createdAt: string | null;
  moderatedAt: string | null;
  moderationReason: string | null;
}

interface UserReportItem {
  id: string;
  reporterUid: string;
  reporterName?: string;
  reporterEmail?: string;
  rightsHolderName?: string;
  rightsHolderEmail?: string;
  rightsBasis?: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  status: string;
  resolution: string | null;
  createdAt: string | null;
}

interface RatingAbuseEvent {
  id: string;
  uid: string;
  assetId: string;
  stars: number;
  type: string;
  status: string;
  createdAt: string | null;
}

interface AssetItem {
  id: string;
  title: string;
  channelId: string;
  commentsOpen: boolean;
}

function ZillionaireModerationRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="moderation">
      {({ token, account, onLock }) => (
        <ZillionaireModerationContent token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionaireModerationContent({
  token,
  account,
  onLock,
}: {
  token: string;
  account: { email: string | null; isOwner: boolean; modules: string[] };
  onLock?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<
    "queue" | "reports" | "keywords" | "ratings" | "titles"
  >("queue");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [reports, setReports] = useState<UserReportItem[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [ratingAlerts, setRatingAlerts] = useState<RatingAbuseEvent[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);

  // Filter states
  const [commentStatusFilter, setCommentStatusFilter] = useState("ALL");
  const [commentSearch, setCommentSearch] = useState("");
  const [titleSearch, setTitleSearch] = useState("");

  // Keyword management
  const [newKeyword, setNewKeyword] = useState("");

  // Action modals
  const [banModal, setBanModal] = useState<{ authorUid: string; commentId?: string } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banBusy, setBanBusy] = useState(false);

  const [reportModal, setReportModal] = useState<UserReportItem | null>(null);
  const [reportResolution, setReportResolution] = useState("");
  const [reportBusy, setReportBusy] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/moderation/", { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load moderation data");

      setComments(data.comments || []);
      setReports(data.reports || []);
      setKeywords(data.keywordFilters || []);
      setRatingAlerts(data.ratingAbuseEvents || []);
      setAssets(data.assets || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  const handleModerateComment = async (
    commentId: string,
    action: "approve_comment" | "hide_comment" | "delete_comment",
  ) => {
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch("/api/public/v1/zillionaire/moderation/", {
        method: "POST",
        headers,
        body: JSON.stringify({ action, commentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");

      setSuccessMessage(`Comment ${commentId} updated.`);
      void loadData();
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Action failed");
    }
  };

  const handleShadowBan = async (authorUid: string, shadowBan: boolean) => {
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch("/api/public/v1/zillionaire/moderation/", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: shadowBan ? "shadow_ban_commenter" : "unshadow_ban_commenter",
          authorUid,
          reason: shadowBan ? "Shadow-ban applied by moderator" : "Shadow-ban lifted",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Shadow ban action failed");

      setSuccessMessage(`Commenter ${authorUid} ${shadowBan ? "shadow-banned" : "unshadow-banned"}.`);
      void loadData();
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Action failed");
    }
  };

  const handleConfirmBan = async () => {
    if (!banModal) return;
    if (!banReason.trim()) {
      alert("Please provide an audit justification reason.");
      return;
    }

    setBanBusy(true);
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch("/api/public/v1/zillionaire/moderation/", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "ban_commenter",
          authorUid: banModal.authorUid,
          reason: banReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to ban commenter");

      setSuccessMessage(`Commenter ${banModal.authorUid} banned from community interactions.`);
      setBanModal(null);
      setBanReason("");
      void loadData();
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to ban commenter");
    } finally {
      setBanBusy(false);
    }
  };

  const handleConfirmReport = async (action: "resolve_report" | "dismiss_report") => {
    if (!reportModal) return;
    setReportBusy(true);
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch("/api/public/v1/zillionaire/moderation/", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action,
          reportId: reportModal.id,
          reason: reportResolution.trim() || "Report resolved",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update report");

      setSuccessMessage(`Report ${reportModal.id} ${action === "resolve_report" ? "resolved" : "dismissed"}.`);
      setReportModal(null);
      setReportResolution("");
      void loadData();
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Report update failed");
    } finally {
      setReportBusy(false);
    }
  };

  const handleAddKeyword = async () => {
    const word = newKeyword.trim().toLowerCase();
    if (!word || keywords.includes(word)) return;
    const updated = [...keywords, word];
    await saveKeywords(updated);
    setNewKeyword("");
  };

  const handleRemoveKeyword = async (wordToRemove: string) => {
    const updated = keywords.filter((w) => w !== wordToRemove);
    await saveKeywords(updated);
  };

  const saveKeywords = async (kwList: string[]) => {
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch("/api/public/v1/zillionaire/moderation/", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "update_keywords", keywords: kwList }),
      });
      if (!res.ok) throw new Error("Failed to save keyword filters");
      setKeywords(kwList);
      setSuccessMessage("Keyword filter rules updated.");
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error saving keywords");
    }
  };

  const handleToggleCommentsOpen = async (assetId: string, currentOpen: boolean) => {
    const nextOpen = !currentOpen;
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch("/api/public/v1/zillionaire/moderation/", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "toggle_asset_comments",
          assetId,
          commentsOpen: nextOpen,
        }),
      });
      if (!res.ok) throw new Error("Failed to toggle comments");
      setAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, commentsOpen: nextOpen } : a)),
      );
      setSuccessMessage(`Comments for title ${assetId} set to ${nextOpen ? "OPEN" : "CLOSED"}.`);
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error toggling comments");
    }
  };

  const handleDismissRatingAbuse = async (alertId: string) => {
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch("/api/public/v1/zillionaire/moderation/", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "dismiss_rating_abuse", alertId }),
      });
      if (!res.ok) throw new Error("Failed to dismiss alert");
      setRatingAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, status: "DISMISSED" } : a)));
      setSuccessMessage("Rating abuse alert dismissed.");
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error dismissing alert");
    }
  };

  const filteredComments = useMemo(() => {
    return comments.filter((c) => {
      const matchStatus =
        commentStatusFilter === "ALL" || c.status.toUpperCase() === commentStatusFilter;
      const matchText =
        !commentSearch.trim() ||
        c.body.toLowerCase().includes(commentSearch.toLowerCase()) ||
        c.authorUid.toLowerCase().includes(commentSearch.toLowerCase()) ||
        c.assetId.toLowerCase().includes(commentSearch.toLowerCase());
      return matchStatus && matchText;
    });
  }, [comments, commentStatusFilter, commentSearch]);

  const filteredAssets = useMemo(() => {
    return assets.filter(
      (a) =>
        !titleSearch.trim() ||
        a.title.toLowerCase().includes(titleSearch.toLowerCase()) ||
        a.id.toLowerCase().includes(titleSearch.toLowerCase()),
    );
  }, [assets, titleSearch]);

  const kpis = useMemo(() => {
    const pendingComments = comments.filter((c) => c.status === "PENDING" || c.status === "FLAGGED_AUTO").length;
    const openReports = reports.filter((r) => r.status === "OPEN").length;
    const activeKeywords = keywords.length;
    const openAbuseAlerts = ratingAlerts.filter((a) => a.status === "OPEN").length;
    return { pendingComments, openReports, activeKeywords, openAbuseAlerts };
  }, [comments, reports, keywords, ratingAlerts]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Community Moderation & Safety"
      tagline="Review viewer comments, user abuse reports, automated keyword filters, rating velocity, and per-title comments controls"
      activePath="/zillionaire/moderation"
      account={{
        email: account.email || undefined,
        isOwner: account.isOwner,
        modules: account.modules,
      }}
      onLock={onLock}
      onRefresh={loadData}
      isRefreshing={loading}
    >
      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ConsoleWelcomeBanner
        title="Community Engagement Governance"
        description="Filter and moderate viewer remarks, address user misconduct reports, detect rating brigading, and enforce keyword rules."
        badgeText="Safety Operations Active"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ConsoleKpiCard
          title="Pending Comments"
          value={kpis.pendingComments}
          subtitle="Awaiting moderation queue"
          variant="gold"
          icon={MessageSquare}
        />
        <ConsoleKpiCard
          title="Open User Reports"
          value={kpis.openReports}
          subtitle="Flagged remarks or abuse"
          variant="purple"
          icon={Flag}
        />
        <ConsoleKpiCard
          title="Active Keyword Rules"
          value={kpis.activeKeywords}
          subtitle="Auto-flagging dictionary"
          variant="blue"
          icon={ShieldCheck}
        />
        <ConsoleKpiCard
          title="Rating Abuse Alerts"
          value={kpis.openAbuseAlerts}
          subtitle="Brigading / velocity spikes"
          variant="green"
          icon={Star}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-2 text-xs">
        {[
          { key: "queue", label: "Comments Queue", icon: MessageSquare },
          { key: "reports", label: "User Reports", icon: Flag },
          { key: "keywords", label: "Keyword Filters", icon: ShieldCheck },
          { key: "ratings", label: "Rating Abuse Detection", icon: Star },
          { key: "titles", label: "Per-Title Comments Control", icon: ToggleRight },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 font-bold transition border-b-2 -mb-px ${
                isActive
                  ? "border-purple-500 text-white bg-purple-500/10 rounded-t-lg"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Comments Queue */}
      {activeTab === "queue" && (
        <ConsoleCard
          title="Viewer Comments Moderation"
          description="Approve, hide, or delete pending viewer comments. Banning or shadow-banning prevents harmful comments from becoming visible."
        >
          <div className="flex flex-col sm:flex-row gap-3 mb-4 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search comment text, author UID, or asset..."
                value={commentSearch}
                onChange={(e) => setCommentSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={commentStatusFilter}
                onChange={(e) => setCommentStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 px-3 py-2 outline-none focus:border-purple-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Review</option>
                <option value="FLAGGED_AUTO">Flagged by Keywords</option>
                <option value="APPROVED">Approved Public</option>
                <option value="HIDDEN">Hidden</option>
                <option value="SHADOW_BANNED">Shadow Banned</option>
                <option value="DELETED">Deleted</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">Viewer & Comment</th>
                  <th className="py-2.5 px-3">Content Asset</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-3 text-right">Moderator Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredComments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No comments match criteria.
                    </td>
                  </tr>
                ) : (
                  filteredComments.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-2.5 px-3 max-w-md">
                        <div className="flex flex-col gap-1">
                          <p className="text-white text-xs font-medium leading-relaxed">{c.body}</p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="font-semibold text-purple-300">{c.viewerNumber}</span>
                            <span className="font-mono text-slate-500">{c.authorUid}</span>
                          </div>
                          {c.flaggedKeywords.length > 0 && (
                            <span className="text-[10px] text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Matches keywords: {c.flaggedKeywords.join(", ")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">{c.assetId}</td>
                      <td className="py-2.5 px-3">
                        <ConsoleStatusBadge
                          status={
                            c.status === "APPROVED"
                              ? "active"
                              : c.status === "PENDING"
                                ? "warning"
                                : c.status === "FLAGGED_AUTO"
                                  ? "warning"
                                  : "suspended"
                          }
                          label={c.status}
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {c.status !== "APPROVED" && (
                            <button
                              onClick={() => handleModerateComment(c.id, "approve_comment")}
                              className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-[11px] hover:bg-emerald-500/20 transition"
                              title="Approve comment for public viewing"
                            >
                              Approve
                            </button>
                          )}
                          {c.status !== "HIDDEN" && (
                            <button
                              onClick={() => handleModerateComment(c.id, "hide_comment")}
                              className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-[11px] hover:bg-amber-500/20 transition"
                              title="Hide comment from public"
                            >
                              Hide
                            </button>
                          )}
                          {c.status !== "DELETED" && (
                            <button
                              onClick={() => handleModerateComment(c.id, "delete_comment")}
                              className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold text-[11px] hover:bg-rose-500/20 transition"
                              title="Delete comment"
                            >
                              Delete
                            </button>
                          )}
                          <button
                            onClick={() => handleShadowBan(c.authorUid, true)}
                            className="px-2 py-1 rounded bg-purple-500/10 border border-purple-500/30 text-purple-300 font-bold text-[11px] hover:bg-purple-500/20 transition"
                            title="Shadow-ban this commenter"
                          >
                            Shadow-Ban
                          </button>
                          <button
                            onClick={() => setBanModal({ authorUid: c.authorUid, commentId: c.id })}
                            className="px-2 py-1 rounded bg-rose-600/20 border border-rose-600/40 text-rose-200 font-bold text-[11px] hover:bg-rose-600/30 transition"
                            title="Ban commenter from commenting"
                          >
                            Ban
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ConsoleCard>
      )}

      {/* Tab 2: User Reports */}
      {activeTab === "reports" && (
        <ConsoleCard
          title="Community Misconduct Reports"
          description="Inquiries and abuse flags submitted by viewers regarding comments, video titles, or user behavior."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">Report ID</th>
                  <th className="py-2.5 px-3">Target</th>
                  <th className="py-2.5 px-3">Reason & Details</th>
                  <th className="py-2.5 px-3">Reporter</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No user reports on file.
                    </td>
                  </tr>
                ) : (
                  reports.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-purple-300">{r.id}</td>
                      <td className="py-2.5 px-3">
                        <span className="capitalize font-semibold text-white">{r.targetType}:</span>{" "}
                        <span className="font-mono text-slate-400">{r.targetId}</span>
                      </td>
                      <td className="py-2.5 px-3 max-w-xs">
                        <p className="font-semibold text-white">{r.reason}</p>
                        {r.details && <p className="text-slate-400 text-[11px] truncate">{r.details}</p>}
                        {r.rightsBasis && <p className="text-amber-200 text-[11px]">Rights claim: {r.rightsBasis}</p>}
                        {r.rightsHolderName && <p className="text-slate-400 text-[11px]">Rights holder: {r.rightsHolderName} · {r.rightsHolderEmail}</p>}
                        {r.reporterName && <p className="text-slate-400 text-[11px]">Reporter: {r.reporterName} · {r.reporterEmail}</p>}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">{r.reporterUid}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.status === "RESOLVED"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : r.status === "DISMISSED"
                                ? "bg-slate-700/40 text-slate-400"
                                : "bg-rose-500/20 text-rose-300"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {r.status === "OPEN" && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setReportModal(r);
                                setReportResolution("");
                              }}
                              className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-[11px] hover:bg-emerald-500/20 transition"
                            >
                              Resolve
                            </button>
                            <button
                              onClick={() => {
                                setReportModal(r);
                                setReportResolution("Dismissed after review");
                                void handleConfirmReport("dismiss_report");
                              }}
                              className="px-2 py-1 rounded bg-slate-800 text-slate-400 font-bold text-[11px] hover:bg-slate-700 transition"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ConsoleCard>
      )}

      {/* Tab 3: Keyword Filters */}
      {activeTab === "keywords" && (
        <ConsoleCard
          title="Automated Keyword Filters"
          description="Viewer comments matching these sensitive terms are automatically marked as FLAGGED_AUTO for moderator inspection."
        >
          <div className="space-y-4">
            <div className="flex gap-2 max-w-md">
              <input
                type="text"
                placeholder="Enter sensitive keyword or phrase..."
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleAddKeyword()}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
              />
              <button
                type="button"
                onClick={handleAddKeyword}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition"
              >
                <Plus className="h-4 w-4" />
                Add Keyword
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <h4 className="text-xs font-bold text-slate-300 mb-3">
                Active Filter Dictionary ({keywords.length} terms)
              </h4>
              {keywords.length === 0 ? (
                <p className="text-slate-500 italic text-xs">No keyword rules configured.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {keywords.map((kw) => (
                    <span
                      key={kw}
                      className="px-3 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-mono flex items-center gap-1.5"
                    >
                      <span>{kw}</span>
                      <button
                        onClick={() => handleRemoveKeyword(kw)}
                        className="p-0.5 hover:text-white rounded"
                        title="Remove keyword"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ConsoleCard>
      )}

      {/* Tab 4: Rating Abuse Detection */}
      {activeTab === "ratings" && (
        <ConsoleCard
          title="Rating Abuse & Brigading Alerts"
          description="Automated telemetry identifying fast 1-star velocity or brigading spikes across published catalog titles."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">Alert ID</th>
                  <th className="py-2.5 px-3">Viewer UID</th>
                  <th className="py-2.5 px-3">Asset ID</th>
                  <th className="py-2.5 px-3">Stars Given</th>
                  <th className="py-2.5 px-3">Anomaly Type</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {ratingAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No rating abuse events detected.
                    </td>
                  </tr>
                ) : (
                  ratingAlerts.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-purple-300">{a.id}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">{a.uid}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">{a.assetId}</td>
                      <td className="py-2.5 px-3">
                        <span className="flex items-center gap-1 font-bold text-amber-400">
                          <Star className="h-3 w-3 fill-amber-400" />
                          {a.stars}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-rose-300">{a.type}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            a.status === "DISMISSED"
                              ? "bg-slate-700/40 text-slate-400"
                              : "bg-rose-500/20 text-rose-300"
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {a.status === "OPEN" && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setBanModal({ authorUid: a.uid })}
                              className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold text-[11px] hover:bg-rose-500/20 transition"
                            >
                              Ban Actor
                            </button>
                            <button
                              onClick={() => handleDismissRatingAbuse(a.id)}
                              className="px-2 py-1 rounded bg-slate-800 text-slate-400 font-bold text-[11px] hover:bg-slate-700 transition"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ConsoleCard>
      )}

      {/* Tab 5: Per-Title Comments Control */}
      {activeTab === "titles" && (
        <ConsoleCard
          title="Per-Title Comments Control"
          description="Enable or disable viewer commenting on individual catalogue movies and series episodes."
        >
          <div className="mb-4">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search title name or ID..."
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">Title Name</th>
                  <th className="py-2.5 px-3">Asset ID</th>
                  <th className="py-2.5 px-3">Channel ID</th>
                  <th className="py-2.5 px-3">Comments State</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No catalogue assets found.
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((ast) => (
                    <tr key={ast.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-2.5 px-3 font-bold text-white">{ast.title}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">{ast.id}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">{ast.channelId}</td>
                      <td className="py-2.5 px-3">
                        {ast.commentsOpen ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300">
                            COMMENTS OPEN
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300">
                            COMMENTS CLOSED
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleToggleCommentsOpen(ast.id, ast.commentsOpen)}
                          className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 ml-auto transition ${
                            ast.commentsOpen
                              ? "bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
                              : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
                          }`}
                        >
                          {ast.commentsOpen ? (
                            <>
                              <ToggleLeft className="h-3.5 w-3.5" />
                              Turn Off
                            </>
                          ) : (
                            <>
                              <ToggleRight className="h-3.5 w-3.5" />
                              Turn On
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ConsoleCard>
      )}

      {/* Ban Commenter Modal */}
      {banModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#091126] p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-rose-400" />
                <h3 className="text-base font-bold text-white">Ban Viewer Commenter</h3>
              </div>
              <button
                onClick={() => setBanModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Are you sure you want to ban commenter{" "}
                <strong className="text-white font-mono">{banModal.authorUid}</strong>? They will be
                blocked from posting new comments or ratings.
              </p>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Audit Justification *</label>
                <textarea
                  rows={3}
                  placeholder="Record reasons for ban and policy violations..."
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/50 p-2.5 text-white outline-none focus:border-rose-500 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBanModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBan}
                  disabled={banBusy}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition shadow-lg shadow-rose-600/30 disabled:opacity-50"
                >
                  {banBusy ? "Processing..." : "Confirm Ban"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Report Modal */}
      {reportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#091126] p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Resolve Community Report</h3>
              </div>
              <button
                onClick={() => setReportModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Resolving report <strong className="text-white font-mono">{reportModal.id}</strong>:{" "}
                <span className="text-slate-400">{reportModal.reason}</span>
              </p>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  Resolution Notes & Action Taken *
                </label>
                <textarea
                  rows={3}
                  placeholder="Record what action was taken (e.g. comment hidden, user warned)..."
                  value={reportResolution}
                  onChange={(e) => setReportResolution(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/50 p-2.5 text-white outline-none focus:border-emerald-500 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmReport("resolve_report")}
                  disabled={reportBusy}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                >
                  {reportBusy ? "Resolving..." : "Confirm Resolution"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
