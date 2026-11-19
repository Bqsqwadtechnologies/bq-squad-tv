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
  Film,
  Search,
  Play,
  Edit,
  Star,
  EyeOff,
  Ban,
  Trash2,
  RotateCcw,
  RefreshCw,
  FolderInput,
  ShieldAlert,
  Sliders,
  CheckSquare,
  Square,
  X,
  Clock,
  Eye,
  MessageSquare,
  Database,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/movies")({
  component: ZillionaireMoviesRoute,
  head: () => ({
    meta: [
      { title: "Movies & Series Control | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface ContentAsset {
  id: string;
  title: string;
  description: string;
  channelId: string;
  category: string;
  ageRating: string;
  posterUrl: string | null;
  masterPlaylistUrl: string | null;
  status: string;
  contentStatus: string;
  viewsCount: number;
  totalWatchMinutes: number;
  ratingAverage: number;
  ratingCount: number;
  commentsCount: number;
  featured: boolean;
  storageLocation: string;
  rightsStatus: string;
  deletedAt: string | null;
  blockedReason: string | null;
  createdAt: string | null;
}

function ZillionaireMoviesRoute() {
  return (
    <ConsolePageGuard
      role="admin"
      module="content"
      title="Movies & Series Control"
      description="Full catalogue veto power: instant block, soft delete, preview, rights review and bulk updates."
    >
      {(token, account, onLock) => (
        <ZillionaireMoviesPage token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionaireMoviesPage({
  account,
  onLock,
}: {
  token: string | null;
  account: { uid: string; email?: string; roles?: string[]; modules?: string[]; isOwner?: boolean } | null;
  onLock?: () => void;
}) {
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PUBLISHED" | "UNPUBLISHED" | "BLOCKED" | "DELETED" | "FEATURED">("ALL");

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // In-console Preview Player Modal
  const [previewAsset, setPreviewAsset] = useState<ContentAsset | null>(null);

  // Edit Details Modal
  const [editingAsset, setEditingAsset] = useState<ContentAsset | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState("general");
  const [editAgeRating, setEditAgeRating] = useState<"G" | "PG" | "12" | "15" | "18">("PG");
  const [editReason, setEditReason] = useState("");

  // Copyright Takedown Modal
  const [takedownAsset, setTakedownAsset] = useState<ContentAsset | null>(null);
  const [takedownClaimant, setTakedownClaimant] = useState("");
  const [takedownRef, setTakedownRef] = useState("");
  const [takedownReason, setTakedownReason] = useState("");

  // Reason Confirmation Modal for Actions
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [targetAssetId, setTargetAssetId] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const headers = await getWebAuthHeaders();
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await fetch(`/api/public/v1/zillionaire/content-assets/?${params.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [searchQuery, statusFilter]);

  const executeAction = async (assetId: string, actionBody: Record<string, unknown>) => {
    setSubmittingAction(true);
    setActionFeedback(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch(`/api/public/v1/zillionaire/content-assets/${assetId}/actions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(actionBody),
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback("Action executed successfully and recorded in immutable audit log.");
        setPendingAction(null);
        setTargetAssetId(null);
        setActionReason("");
        await fetchAssets();
      } else {
        setActionFeedback(`Action failed: ${data.message || data.error}`);
      }
    } catch (err: unknown) {
      setActionFeedback(err instanceof Error ? err.message : "Error executing action.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleBulkAction = async (action: string, extra: Record<string, unknown> = {}) => {
    if (selectedIds.size === 0) return;
    const reason = prompt(`Enter reason for ${action} on ${selectedIds.size} titles:`);
    if (!reason || reason.trim().length < 3) return;

    setSubmittingAction(true);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch("/api/public/v1/zillionaire/content-assets/", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          assetIds: Array.from(selectedIds),
          reason: reason.trim(),
          ...extra,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback(`Bulk action completed on ${data.updatedCount} titles.`);
        setSelectedIds(new Set());
        await fetchAssets();
      } else {
        setActionFeedback(`Bulk action failed: ${data.message || data.error}`);
      }
    } catch (err: unknown) {
      setActionFeedback(err instanceof Error ? err.message : "Error executing bulk action.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === assets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(assets.map((a) => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const stats = useMemo(() => {
    const total = assets.length;
    const published = assets.filter((a) => a.contentStatus === "published" && a.status !== "BLOCKED" && a.status !== "DELETED").length;
    const blocked = assets.filter((a) => a.status === "BLOCKED" || a.status === "TAKEDOWN").length;
    const watchMins = assets.reduce((sum, a) => sum + a.totalWatchMinutes, 0);
    return { total, published, blocked, watchMins };
  }, [assets]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Movies & Series Control"
      subtitle="Complete owner catalogue veto power: instant block, preview, soft delete, rights and bulk operations"
      account={account}
      onLock={onLock}
      activePath="/zillionaire/movies"
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Content Control & Veto Power"
          subtitle="Instant block halts playback globally within seconds. Soft-deleted content retains 30-day restore before permanent automated purge."
        />

        {/* Feedback alert */}
        {actionFeedback && (
          <div className="p-3 bg-cyan-950/60 border border-cyan-800 rounded-lg text-cyan-200 text-xs flex items-center justify-between">
            <span>{actionFeedback}</span>
            <button onClick={() => setActionFeedback(null)} className="text-cyan-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ConsoleKpiCard
            title="Total Catalogue Titles"
            value={stats.total.toLocaleString()}
            change="Movies & episodes"
            icon={<Film className="w-5 h-5" />}
            color="blue"
          />
          <ConsoleKpiCard
            title="Active & Published"
            value={stats.published.toLocaleString()}
            change="Live for streaming"
            icon={<Play className="w-5 h-5" />}
            color="green"
          />
          <ConsoleKpiCard
            title="Blocked / Takedown"
            value={stats.blocked.toLocaleString()}
            change="Playback revoked"
            icon={<Ban className="w-5 h-5" />}
            color="purple"
          />
          <ConsoleKpiCard
            title="Total Watch Minutes"
            value={stats.watchMins.toLocaleString()}
            change="Across all titles"
            icon={<Clock className="w-5 h-5" />}
            color="gold"
          />
        </div>

        {/* Search, Filter & Bulk Action Bar */}
        <ConsoleCard title="Catalogue Browser & Bulk Controls">
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title, channel ID, category, or video ID..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1">
                {(["ALL", "PUBLISHED", "UNPUBLISHED", "BLOCKED", "DELETED", "FEATURED"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      statusFilter === st
                        ? "bg-cyan-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Bulk Action Controls when items selected */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-cyan-950/40 border border-cyan-800/80 rounded-lg text-xs">
                <span className="font-bold text-cyan-300">
                  {selectedIds.size} title{selectedIds.size > 1 ? "s" : ""} selected
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleBulkAction("bulk_block")}
                    className="px-2.5 py-1.5 bg-red-800 hover:bg-red-700 text-white rounded font-bold flex items-center gap-1"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Bulk Block</span>
                  </button>
                  <button
                    onClick={() => handleBulkAction("bulk_unpublish")}
                    className="px-2.5 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded font-bold flex items-center gap-1"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Bulk Unpublish</span>
                  </button>
                  <button
                    onClick={() => {
                      const cat = prompt("Enter new category name for selected titles:");
                      if (cat) handleBulkAction("bulk_change_category", { category: cat.trim() });
                    }}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold"
                  >
                    Change Category
                  </button>
                  <button
                    onClick={() => {
                      const rating = prompt("Enter new Age Rating (G, PG, 12, 15, 18):");
                      if (rating && ["G", "PG", "12", "15", "18"].includes(rating.toUpperCase())) {
                        handleBulkAction("bulk_change_age_rating", { ageRating: rating.toUpperCase() });
                      }
                    }}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold"
                  >
                    Change Age Rating
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="px-2.5 py-1.5 bg-slate-900 text-slate-400 hover:text-white rounded"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            )}
          </div>
        </ConsoleCard>

        {/* Movies and Series Table */}
        <ConsoleCard title={`Catalogue Index (${assets.length} Titles)`}>
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading movies and series catalogue...</div>
          ) : assets.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No content assets match your query.</div>
          ) : (
            <ConsoleTable
              columns={[
                {
                  key: "select",
                  label: (
                    <button onClick={toggleSelectAll} className="p-1 text-slate-400 hover:text-white">
                      {selectedIds.size === assets.length ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  ) as any,
                },
                { key: "title", label: "Title & Artwork" },
                { key: "channel", label: "Channel" },
                { key: "status", label: "Status" },
                { key: "metrics", label: "Views / Watch Time" },
                { key: "rating", label: "Rating / Comments" },
                { key: "storage", label: "Storage & Rights" },
                { key: "actions", label: "Veto Actions" },
              ]}
              data={assets.map((a) => ({
                id: a.id,
                select: (
                  <button onClick={() => toggleSelect(a.id)} className="p-1 text-slate-400 hover:text-white">
                    {selectedIds.has(a.id) ? (
                      <CheckSquare className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                ),
                title: (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-16 bg-slate-950 rounded border border-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center text-slate-600">
                      {a.posterUrl ? (
                        <img src={a.posterUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Film className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-white text-xs flex items-center gap-1.5">
                        <span>{a.title}</span>
                        {a.featured && (
                          <span className="p-0.5 text-[10px] text-amber-300 bg-amber-950/60 border border-amber-800 rounded font-semibold flex items-center gap-0.5">
                            <Star className="w-2.5 h-2.5 fill-amber-300" /> Featured
                          </span>
                        )}
                        <span className="text-[10px] px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {a.ageRating}
                        </span>
                      </div>
                      <div className="text-slate-400 text-[11px] line-clamp-1">{a.description || "No description"}</div>
                      <div className="text-slate-500 text-[10px] font-mono mt-0.5">{a.id}</div>
                    </div>
                  </div>
                ),
                channel: (
                  <span className="text-xs font-mono text-cyan-400 font-semibold">{a.channelId}</span>
                ),
                status: (
                  <ConsoleStatusBadge
                    status={
                      a.status === "BLOCKED" || a.status === "TAKEDOWN"
                        ? "error"
                        : a.status === "DELETED"
                        ? "error"
                        : a.contentStatus === "published"
                        ? "active"
                        : "warning"
                    }
                    label={
                      a.status === "BLOCKED"
                        ? "BLOCKED"
                        : a.status === "DELETED"
                        ? "SOFT DELETED"
                        : a.contentStatus.toUpperCase()
                    }
                  />
                ),
                metrics: (
                  <div className="text-xs">
                    <div className="text-white font-medium flex items-center gap-1">
                      <Eye className="w-3 h-3 text-slate-400" />
                      <span>{a.viewsCount.toLocaleString()} views</span>
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{a.totalWatchMinutes.toLocaleString()} min</span>
                    </div>
                  </div>
                ),
                rating: (
                  <div className="text-xs">
                    <div className="text-amber-400 font-medium flex items-center gap-1">
                      <Star className="w-3 h-3 fill-amber-400" />
                      <span>{a.ratingAverage.toFixed(1)} ({a.ratingCount})</span>
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-slate-400" />
                      <span>{a.commentsCount} comments</span>
                    </div>
                  </div>
                ),
                storage: (
                  <div className="text-xs">
                    <div className="text-slate-300 font-mono text-[11px] flex items-center gap-1">
                      <Database className="w-3 h-3 text-slate-400" />
                      <span>{a.storageLocation}</span>
                    </div>
                    <div className="text-emerald-400 text-[11px] flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span className="uppercase">{a.rightsStatus}</span>
                    </div>
                  </div>
                ),
                actions: (
                  <div className="flex flex-wrap items-center gap-1 text-[11px]">
                    {/* Preview button */}
                    <button
                      onClick={() => setPreviewAsset(a)}
                      className="p-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 rounded"
                      title="Preview In-Console Player"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>

                    {/* Edit Details */}
                    <button
                      onClick={() => {
                        setEditingAsset(a);
                        setEditTitle(a.title);
                        setEditDesc(a.description);
                        setEditCategory(a.category);
                        setEditAgeRating(a.ageRating as any);
                        setEditReason("");
                      }}
                      className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                      title="Edit Details"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    {/* Feature / Unfeature */}
                    <button
                      onClick={() => {
                        setTargetAssetId(a.id);
                        setPendingAction(a.featured ? "unfeature" : "feature");
                      }}
                      className={`p-1 border rounded ${
                        a.featured
                          ? "bg-amber-950 hover:bg-amber-900 border-amber-800 text-amber-300"
                          : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400"
                      }`}
                      title={a.featured ? "Remove from Featured" : "Add to Featured"}
                    >
                      <Star className={`w-3.5 h-3.5 ${a.featured ? "fill-amber-300" : ""}`} />
                    </button>

                    {/* Block / Unblock */}
                    {a.status === "BLOCKED" ? (
                      <button
                        onClick={() => {
                          setTargetAssetId(a.id);
                          setPendingAction("restore");
                        }}
                        className="px-2 py-0.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded"
                      >
                        Unblock
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setTargetAssetId(a.id);
                          setPendingAction("block");
                        }}
                        className="p-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded"
                        title="BLOCK Playback Everywhere"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Delete / Restore */}
                    {a.status === "DELETED" ? (
                      <button
                        onClick={() => {
                          setTargetAssetId(a.id);
                          setPendingAction("restore");
                        }}
                        className="p-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded"
                        title="Restore Soft-Deleted Title"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setTargetAssetId(a.id);
                          setPendingAction("delete");
                        }}
                        className="p-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 rounded"
                        title="Soft Delete (30-day restore)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Reprocess */}
                    <button
                      onClick={() => {
                        setTargetAssetId(a.id);
                        setPendingAction("reprocess");
                      }}
                      className="p-1 bg-purple-950 hover:bg-purple-900 border border-purple-800 text-purple-300 rounded"
                      title="Reprocess Video via Worker"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>

                    {/* Move Channel */}
                    <button
                      onClick={() => {
                        const targetCh = prompt("Enter target Channel ID:");
                        if (targetCh) {
                          setTargetAssetId(a.id);
                          setPendingAction("move_channel");
                          (window as any).__pendingChannelId = targetCh.trim();
                        }
                      }}
                      className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                      title="Move to another Channel"
                    >
                      <FolderInput className="w-3.5 h-3.5" />
                    </button>

                    {/* Copyright Takedown */}
                    <button
                      onClick={() => {
                        setTakedownAsset(a);
                        setTakedownClaimant("");
                        setTakedownRef("");
                        setTakedownReason("");
                      }}
                      className="p-1 bg-amber-950 hover:bg-amber-900 border border-amber-800 text-amber-300 rounded"
                      title="Copyright Complaint Takedown"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ),
              }))}
            />
          )}
        </ConsoleCard>

        {/* Modal: In-Console Preview Player */}
        {previewAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl space-y-4 p-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Play className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">{previewAsset.title} (Owner Preview)</h3>
                </div>
                <button onClick={() => setPreviewAsset(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="aspect-video bg-black rounded-lg border border-slate-800 flex items-center justify-center relative overflow-hidden">
                {previewAsset.masterPlaylistUrl ? (
                  <video
                    controls
                    autoPlay
                    src={previewAsset.masterPlaylistUrl}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-6 space-y-2">
                    <Film className="w-12 h-12 text-slate-600 mx-auto" />
                    <p className="text-slate-400 text-xs">
                      Master HLS stream lease preview ({previewAsset.id})
                    </p>
                    <p className="text-slate-500 text-[11px] font-mono">
                      Storage: {previewAsset.storageLocation}
                    </p>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-400 flex justify-between items-center">
                <span>Status: <strong className="text-white">{previewAsset.status}</strong></span>
                <span>Content Status: <strong className="text-white">{previewAsset.contentStatus}</strong></span>
                <span>Age Rating: <strong className="text-white">{previewAsset.ageRating}</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Edit Details */}
        {editingAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Edit className="w-4 h-4 text-cyan-400" />
                  Edit Video Details
                </h3>
                <button onClick={() => setEditingAsset(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Category</label>
                    <input
                      type="text"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Age Rating</label>
                    <select
                      value={editAgeRating}
                      onChange={(e) => setEditAgeRating(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    >
                      <option value="G">G (All Ages)</option>
                      <option value="PG">PG (Parental Guidance)</option>
                      <option value="12">12+</option>
                      <option value="15">15+</option>
                      <option value="18">18+ (Adults Only)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Reason for update (min 3 chars)</label>
                  <input
                    type="text"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="e.g. Corrected synopsis and age certification"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAsset(null)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingAction || !editTitle.trim() || editReason.trim().length < 3}
                  onClick={async () => {
                    await executeAction(editingAsset.id, {
                      action: "edit_details",
                      title: editTitle.trim(),
                      description: editDesc.trim(),
                      category: editCategory.trim(),
                      ageRating: editAgeRating,
                      tags: [],
                      reason: editReason.trim(),
                    });
                    setEditingAsset(null);
                  }}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded font-bold"
                >
                  {submittingAction ? "Saving..." : "Save Details"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Copyright Takedown */}
        {takedownAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  Copyright Complaint Takedown
                </h3>
                <button onClick={() => setTakedownAsset(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Claimant / Rights Holder</label>
                  <input
                    type="text"
                    value={takedownClaimant}
                    onChange={(e) => setTakedownClaimant(e.target.value)}
                    placeholder="e.g. Warner Bros. Discovery / Legal Rep"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Notice / Case Reference #</label>
                  <input
                    type="text"
                    value={takedownRef}
                    onChange={(e) => setTakedownRef(e.target.value)}
                    placeholder="e.g. DMCA-2026-0881"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Takedown Reason & Legal Record</label>
                  <textarea
                    rows={3}
                    value={takedownReason}
                    onChange={(e) => setTakedownReason(e.target.value)}
                    placeholder="Formal justification and summary of notice..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTakedownAsset(null)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingAction || !takedownClaimant.trim() || !takedownRef.trim() || takedownReason.trim().length < 3}
                  onClick={async () => {
                    await executeAction(takedownAsset.id, {
                      action: "takedown",
                      claimant: takedownClaimant.trim(),
                      complaintRef: takedownRef.trim(),
                      reason: takedownReason.trim(),
                    });
                    setTakedownAsset(null);
                  }}
                  className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded font-bold"
                >
                  {submittingAction ? "Recording Takedown..." : "Enforce Takedown & Halt Stream"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Mandatory Reason Action Confirmation */}
        {pendingAction && targetAssetId && (
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
                You are executing <strong>{pendingAction}</strong> on content asset <code>{targetAssetId}</code>.
                State the reason to record in the permanent audit trail.
              </p>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Reason (min 3 chars):</label>
                <textarea
                  rows={3}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Justification or ticket reference..."
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
                    const extra: Record<string, unknown> = {};
                    if (pendingAction === "feature") extra.featured = true;
                    if (pendingAction === "unfeature") extra.featured = false;
                    if (pendingAction === "move_channel") extra.channelId = (window as any).__pendingChannelId || "platform";

                    const realAction = pendingAction === "unfeature" ? "feature" : pendingAction;
                    await executeAction(targetAssetId, {
                      action: realAction,
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
      </div>
    </ConsoleShell>
  );
}
