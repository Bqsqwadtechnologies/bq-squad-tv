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
  Layers,
  Sparkles,
  Tv,
  Tag,
  Globe,
  DollarSign,
  Calendar,
  Pin,
  Plus,
  ChevronUp,
  ChevronDown,
  Trash,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import type {
  ShelfDefinition,
  FeaturedHero,
  MovieCurationOverride,
} from "@/routes/api/public/v1/zillionaire/movies/curation/index";

export const Route = createFileRoute("/zillionaire/movies")({
  component: ZillionaireMoviesRoute,
  head: () => ({
    meta: [
      { title: "Movies & Catalogue Management | Zillionaire Control Centre" },
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
  ownershipDeclaration?: boolean;
  copyrightDeclaration?: boolean;
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
      title="Movies & Catalogue Management"
      description="Full catalogue veto power: shelves, featured hero rotation, regional windows, price overrides, and rights reviews."
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
  const [activeTab, setActiveTab] = useState<"CATALOGUE" | "SHELVES" | "HERO_ROTATION" | "CURATION_OVERRIDES">("CATALOGUE");
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

  // Curation State: Shelves, Hero, Overrides
  const [curationLoading, setCurationLoading] = useState(false);
  const [shelves, setShelves] = useState<ShelfDefinition[]>([]);
  const [heroes, setHeroes] = useState<FeaturedHero[]>([]);
  const [curationOverrides, setCurationOverrides] = useState<Record<string, MovieCurationOverride>>({});

  // Curation Overrides Active Movie Selection
  const [selectedMovieForOverride, setSelectedMovieForOverride] = useState<string>("");
  const [overridePinRank, setOverridePinRank] = useState<number>(0);
  const [overrideTags, setOverrideTags] = useState<string>("");
  const [overrideSimilarIds, setOverrideSimilarIds] = useState<string[]>([]);
  const [overrideRegionMode, setOverrideRegionMode] = useState<"GLOBAL" | "WHITELIST" | "BLACKLIST">("GLOBAL");
  const [overrideCountries, setOverrideCountries] = useState<string>("");
  const [overrideAvailableFrom, setOverrideAvailableFrom] = useState<string>("");
  const [overrideAvailableTo, setOverrideAvailableTo] = useState<string>("");
  const [overridePricePerMin, setOverridePricePerMin] = useState<string>("");
  const [overrideFreeMins, setOverrideFreeMins] = useState<number>(0);

  // New Hero Modal
  const [showHeroModal, setShowHeroModal] = useState(false);
  const [heroFormAssetId, setHeroFormAssetId] = useState("");
  const [heroFormTitle, setHeroFormTitle] = useState("");
  const [heroFormHeadline, setHeroFormHeadline] = useState("");
  const [heroFormTagline, setHeroFormTagline] = useState("");
  const [heroFormCtaText, setHeroFormCtaText] = useState("Watch Now");
  const [heroFormCtaUrl, setHeroFormCtaUrl] = useState("/");
  const [heroFormBannerUrl, setHeroFormBannerUrl] = useState("");
  const [heroFormBadgeText, setHeroFormBadgeText] = useState("Featured");
  const [heroFormStartDate, setHeroFormStartDate] = useState("");
  const [heroFormEndDate, setHeroFormEndDate] = useState("");
  const [heroFormStatus, setHeroFormStatus] = useState<"ACTIVE" | "SCHEDULED" | "PAUSED">("ACTIVE");

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

  const fetchCurationData = async () => {
    setCurationLoading(true);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch("/api/public/v1/zillionaire/movies/curation/", { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.shelves) setShelves(data.shelves);
        if (data.heroes) setHeroes(data.heroes);
        if (data.overrides) setCurationOverrides(data.overrides);
      }
    } catch {
      // ignore
    } finally {
      setCurationLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchCurationData();
  }, []);

  // When active movie for override changes, sync form
  useEffect(() => {
    if (!selectedMovieForOverride) {
      setOverridePinRank(0);
      setOverrideTags("");
      setOverrideSimilarIds([]);
      setOverrideRegionMode("GLOBAL");
      setOverrideCountries("");
      setOverrideAvailableFrom("");
      setOverrideAvailableTo("");
      setOverridePricePerMin("");
      setOverrideFreeMins(0);
      return;
    }

    const cur = curationOverrides[selectedMovieForOverride];
    if (cur) {
      setOverridePinRank(cur.pinRank || 0);
      setOverrideTags((cur.tags || []).join(", "));
      setOverrideSimilarIds(cur.similarTitleIds || []);
      if (cur.regionAvailability) {
        setOverrideRegionMode(cur.regionAvailability.mode || "GLOBAL");
        setOverrideCountries((cur.regionAvailability.countries || []).join(", "));
        setOverrideAvailableFrom(cur.regionAvailability.availableFrom || "");
        setOverrideAvailableTo(cur.regionAvailability.availableTo || "");
      } else {
        setOverrideRegionMode("GLOBAL");
        setOverrideCountries("");
        setOverrideAvailableFrom("");
        setOverrideAvailableTo("");
      }
      if (cur.pricingOverride) {
        setOverridePricePerMin(cur.pricingOverride.pricePerMinute !== null && cur.pricingOverride.pricePerMinute !== undefined ? String(cur.pricingOverride.pricePerMinute) : "");
        setOverrideFreeMins(cur.pricingOverride.freePreviewMinutes || 0);
      } else {
        setOverridePricePerMin("");
        setOverrideFreeMins(0);
      }
    } else {
      setOverridePinRank(0);
      setOverrideTags("");
      setOverrideSimilarIds([]);
      setOverrideRegionMode("GLOBAL");
      setOverrideCountries("");
      setOverrideAvailableFrom("");
      setOverrideAvailableTo("");
      setOverridePricePerMin("");
      setOverrideFreeMins(0);
    }
  }, [selectedMovieForOverride, curationOverrides]);

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

  const executePublicationAction = async (assetId: string, stage: "approve" | "publish") => {
    const reason = window.prompt("Enter the reason for " + stage + ":", stage === "approve" ? "Reviewed content, age rating and rights evidence" : "Approved content published after rights verification");
    if (!reason || reason.trim().length < 3) return;
    setSubmittingAction(true);
    setActionFeedback(null);
    try {
      const headers = await getWebAuthHeaders();
      const response = await fetch("/api/public/v1/zillionaire/content-assets/" + encodeURIComponent(assetId) + "/" + stage, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "The publication action could not be completed.");
      setActionFeedback(stage === "approve" ? "Video approved for the separate publishing step." : "Video published successfully.");
      await fetchAssets();
    } catch (caught) {
      setActionFeedback(caught instanceof Error ? caught.message : "The publication action could not be completed.");
    } finally {
      setSubmittingAction(false);
    }
  };
  const handleBulkAction = async (action: string, extra: Record<string, unknown> = {}) => {
    if (selectedIds.size === 0) return;
    const reason = prompt(`Enter reason for ${action} on ${selectedIds.size} titles:`);
    if (!reason || reason.trim().length < 3) return;

    setSubmittingAction(true);
    setActionFeedback(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch("/api/public/v1/zillionaire/content-assets/bulk-actions", {
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
        setActionFeedback(`Bulk ${action} succeeded for ${selectedIds.size} titles.`);
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

  const handleSaveShelves = async () => {
    const reason = prompt("Enter reason for saving shelves curation configuration:");
    if (!reason || reason.trim().length < 3) return;

    setSubmittingAction(true);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch("/api/public/v1/zillionaire/movies/curation/", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SAVE_SHELVES",
          shelves,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback("Collections and shelves updated and verified.");
        if (data.shelves) setShelves(data.shelves);
      } else {
        setActionFeedback(`Failed saving shelves: ${data.message || data.error}`);
      }
    } catch (err: unknown) {
      setActionFeedback(err instanceof Error ? err.message : "Error saving shelves.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSaveHeroes = async () => {
    const reason = prompt("Enter reason for saving featured hero rotation:");
    if (!reason || reason.trim().length < 3) return;

    setSubmittingAction(true);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch("/api/public/v1/zillionaire/movies/curation/", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SAVE_HERO_ROTATION",
          heroes,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback("Featured hero rotation updated and saved.");
        if (data.heroes) setHeroes(data.heroes);
      } else {
        setActionFeedback(`Failed saving heroes: ${data.message || data.error}`);
      }
    } catch (err: unknown) {
      setActionFeedback(err instanceof Error ? err.message : "Error saving heroes.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSaveMovieCuration = async () => {
    if (!selectedMovieForOverride) return;
    const reason = prompt(`Enter reason for updating curation on ${selectedMovieForOverride}:`);
    if (!reason || reason.trim().length < 3) return;

    const countries = overrideCountries
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length === 2);

    const tags = overrideTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const priceNum = overridePricePerMin.trim() ? parseFloat(overridePricePerMin) : null;

    setSubmittingAction(true);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch("/api/public/v1/zillionaire/movies/curation/", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SET_MOVIE_CURATION",
          override: {
            assetId: selectedMovieForOverride,
            pinRank: overridePinRank,
            tags,
            similarTitleIds: overrideSimilarIds,
            regionAvailability: {
              mode: overrideRegionMode,
              countries,
              availableFrom: overrideAvailableFrom || null,
              availableTo: overrideAvailableTo || null,
            },
            pricingOverride: {
              pricePerMinute: priceNum,
              freePreviewMinutes: overrideFreeMins,
              currency: "NGN",
            },
          },
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback(`Curation overrides saved for movie ${selectedMovieForOverride}.`);
        await fetchCurationData();
      } else {
        setActionFeedback(`Failed saving overrides: ${data.message || data.error}`);
      }
    } catch (err: unknown) {
      setActionFeedback(err instanceof Error ? err.message : "Error saving movie overrides.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const stats = useMemo(() => {
    const total = assets.length;
    const published = assets.filter((a) => a.contentStatus === "published" && a.status !== "BLOCKED" && a.status !== "DELETED").length;
    const blocked = assets.filter((a) => a.status === "BLOCKED" || a.status === "TAKEDOWN").length;
    const activeShelvesCount = shelves.filter((s) => s.enabled).length;
    const activeHeroesCount = heroes.filter((h) => h.status === "ACTIVE").length;
    return { total, published, blocked, activeShelvesCount, activeHeroesCount };
  }, [assets, shelves, heroes]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Movies & Catalogue Management"
      subtitle="Complete owner catalogue curation: shelves, hero carousel rotation, regional availability, price overrides, and rights reviews."
      account={account}
      onLock={onLock}
      activePath="/zillionaire/movies"
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Movies Catalogue & Curation Engine"
          subtitle="Manage collections and shelves (Trending, New Releases, For You), hero banner rotations with automated scheduling, geo-availability windows, and price per minute overrides."
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

        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ConsoleKpiCard
            title="Total Movies & Titles"
            value={stats.total.toLocaleString()}
            change="Catalogue assets"
            icon={<Film className="w-5 h-5" />}
            color="blue"
          />
          <ConsoleKpiCard
            title="Active Shelves"
            value={stats.activeShelvesCount.toLocaleString()}
            change="Trending, New, Custom"
            icon={<Layers className="w-5 h-5" />}
            color="green"
          />
          <ConsoleKpiCard
            title="Featured Hero Slides"
            value={stats.activeHeroesCount.toLocaleString()}
            change="Active rotations"
            icon={<Sparkles className="w-5 h-5" />}
            color="gold"
          />
          <ConsoleKpiCard
            title="Blocked / Takedown"
            value={stats.blocked.toLocaleString()}
            change="Vetoed titles"
            icon={<Ban className="w-5 h-5" />}
            color="purple"
          />
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 space-x-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab("CATALOGUE")}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === "CATALOGUE"
                ? "bg-slate-900 border-t-2 border-cyan-500 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-900/40"
            }`}
          >
            <Film className="w-4 h-4 text-cyan-400" />
            <span>Catalogue & Takedowns</span>
          </button>

          <button
            onClick={() => setActiveTab("SHELVES")}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === "SHELVES"
                ? "bg-slate-900 border-t-2 border-cyan-500 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-900/40"
            }`}
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Collections & Shelves</span>
          </button>

          <button
            onClick={() => setActiveTab("HERO_ROTATION")}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === "HERO_ROTATION"
                ? "bg-slate-900 border-t-2 border-cyan-500 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-900/40"
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Featured Hero Rotation</span>
          </button>

          <button
            onClick={() => setActiveTab("CURATION_OVERRIDES")}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === "CURATION_OVERRIDES"
                ? "bg-slate-900 border-t-2 border-cyan-500 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-900/40"
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>Regional & Pricing Overrides</span>
          </button>
        </div>

        {/* TAB 1: CATALOGUE & TAKEDOWNS */}
        {activeTab === "CATALOGUE" && (
          <div className="space-y-6">
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

                {/* Bulk Action Controls */}
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
                        onClick={() => handleBulkAction("bulk_feature", { featured: true })}
                        className="px-2.5 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded font-bold flex items-center gap-1"
                      >
                        <Star className="w-3.5 h-3.5" />
                        <span>Bulk Feature</span>
                      </button>
                      <button
                        onClick={() => handleBulkAction("bulk_delete")}
                        className="px-2.5 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded font-bold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Soft Delete</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </ConsoleCard>

            {/* Movies Table */}
            <ConsoleCard title={`Titles (${assets.length})`}>
              <ConsoleTable
                columns={[
                  {
                    key: "select",
                    header: (
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedIds.size === assets.length) setSelectedIds(new Set());
                          else setSelectedIds(new Set(assets.map((a) => a.id)));
                        }}
                        className="text-slate-400 hover:text-white"
                      >
                        {selectedIds.size === assets.length && assets.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    ),
                    render: (a: ContentAsset) => (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = new Set(selectedIds);
                          if (next.has(a.id)) next.delete(a.id);
                          else next.add(a.id);
                          setSelectedIds(next);
                        }}
                        className="text-slate-400 hover:text-white"
                      >
                        {selectedIds.has(a.id) ? (
                          <CheckSquare className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    ),
                  },
                  {
                    key: "title",
                    header: "Title & Channel",
                    render: (a: ContentAsset) => (
                      <div className="flex items-center gap-3">
                        {a.posterUrl ? (
                          <img src={a.posterUrl} alt="" className="w-10 h-14 object-cover rounded bg-slate-900 border border-slate-800" />
                        ) : (
                          <div className="w-10 h-14 rounded bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600">
                            <Film className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <span>{a.title}</span>
                            {a.featured && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>Channel: {a.channelId}</span>
                            <span>•</span>
                            <span>Rating: {a.ageRating}</span>
                            <span>•</span>
                            <span>Rights: {a.ownershipDeclaration && a.copyrightDeclaration ? "Declared" : "Declaration missing"}</span>
                            <span>•</span>
                            <span>{a.category}</span>
                          </div>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (a: ContentAsset) => {
                      if (a.status === "BLOCKED") return <ConsoleStatusBadge status="FAILED" text="BLOCKED" />;
                      if (a.status === "TAKEDOWN") return <ConsoleStatusBadge status="FAILED" text="TAKEDOWN" />;
                      if (a.deletedAt) return <ConsoleStatusBadge status="ARCHIVED" text="DELETED" />;
                      if (a.contentStatus === "published") return <ConsoleStatusBadge status="ACTIVE" text="PUBLISHED" />;
                      return <ConsoleStatusBadge status="PENDING" text={a.contentStatus.toUpperCase()} />;
                    },
                  },
                  {
                    key: "metrics",
                    header: "Views / Watch Mins",
                    render: (a: ContentAsset) => (
                      <div className="text-xs">
                        <div className="text-slate-200 font-semibold">{a.viewsCount.toLocaleString()} views</div>
                        <div className="text-slate-400">{a.totalWatchMinutes.toLocaleString()} mins</div>
                      </div>
                    ),
                  },
                  {
                    key: "actions",
                    header: "Actions",
                    render: (a: ContentAsset) => (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setPreviewAsset(a)}
                          title="Preview Video"
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingAsset(a);
                            setEditTitle(a.title);
                            setEditDesc(a.description || "");
                            setEditCategory(a.category || "general");
                            setEditAgeRating((a.ageRating as any) || "PG");
                          }}
                          title="Edit Details"
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        {a.status === "ready" && a.contentStatus !== "published" && (
                          <button
                            onClick={() => void executePublicationAction(a.id, "approve")}
                            disabled={submittingAction}
                            title="Approve after processing and rights evidence review"
                            className="rounded bg-cyan-950 px-2 py-1 text-[10px] font-bold text-cyan-200 hover:bg-cyan-900 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        {a.status === "ready" && a.contentStatus !== "published" && a.rightsStatus === "verified" && (
                          <button
                            onClick={() => void executePublicationAction(a.id, "publish")}
                            disabled={submittingAction}
                            title="Publish approved content with verified rights"
                            className="rounded bg-emerald-950 px-2 py-1 text-[10px] font-bold text-emerald-200 hover:bg-emerald-900 disabled:opacity-50"
                          >
                            Publish
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setTargetAssetId(a.id);
                            setPendingAction(a.status === "BLOCKED" ? "restore" : "block");
                          }}
                          title={a.status === "BLOCKED" ? "Restore Title" : "Instant Veto Block"}
                          className={`p-1.5 rounded ${
                            a.status === "BLOCKED"
                              ? "bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-800"
                              : "bg-red-950 text-red-300 hover:bg-red-900 border border-red-800"
                          }`}
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setTakedownAsset(a)}
                          title="Copyright Takedown Notice"
                          className="p-1.5 bg-amber-950 text-amber-300 hover:bg-amber-900 border border-amber-800 rounded"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ),
                  },
                ]}
                data={assets}
                loading={loading}
                emptyMessage="No movie or episodic titles found in catalogue."
              />
            </ConsoleCard>
          </div>
        )}

        {/* TAB 2: COLLECTIONS & SHELVES */}
        {activeTab === "SHELVES" && (
          <div className="space-y-6">
            <ConsoleCard
              title="Home & Discovery Shelves Manager"
              actions={
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const name = prompt("Enter shelf name (e.g. Action Blockbusters):");
                      if (!name || name.trim().length < 2) return;
                      const newShelf: ShelfDefinition = {
                        id: `shelf_${Date.now()}`,
                        name: name.trim(),
                        title: name.trim(),
                        description: "Curated collection",
                        type: "custom",
                        assetIds: [],
                        pinnedAssetIds: [],
                        enabled: true,
                        order: shelves.length + 1,
                        updatedAt: new Date().toISOString(),
                      };
                      setShelves([...shelves, newShelf]);
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Custom Shelf</span>
                  </button>
                  <button
                    onClick={handleSaveShelves}
                    disabled={submittingAction}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded text-xs font-bold flex items-center gap-1.5"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Save Shelves</span>
                  </button>
                </div>
              }
            >
              <p className="text-xs text-slate-400 mb-4">
                Define the rows shown on the viewer home and discovery surfaces. Reorder shelves, toggle active visibility, pin specific titles to the front of each shelf, and assign catalogue movies.
              </p>

              <div className="space-y-4">
                {shelves.map((shelf, sIdx) => (
                  <div
                    key={shelf.id}
                    className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-slate-800 text-cyan-400 font-bold text-xs flex items-center justify-center">
                          {sIdx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            <span>{shelf.name}</span>
                            <span className="text-2xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 uppercase">
                              {shelf.type}
                            </span>
                            {!shelf.enabled && (
                              <span className="text-2xs px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800">
                                Disabled
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">{shelf.title} — {shelf.description}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const updated = [...shelves];
                            updated[sIdx].enabled = !updated[sIdx].enabled;
                            setShelves(updated);
                          }}
                          className={`px-2.5 py-1 rounded text-2xs font-bold ${
                            shelf.enabled
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : "bg-slate-800 text-slate-400 hover:text-white"
                          }`}
                        >
                          {shelf.enabled ? "Visible" : "Hidden"}
                        </button>

                        <button
                          disabled={sIdx === 0}
                          onClick={() => {
                            if (sIdx === 0) return;
                            const updated = [...shelves];
                            const temp = updated[sIdx - 1];
                            updated[sIdx - 1] = updated[sIdx];
                            updated[sIdx] = temp;
                            setShelves(updated);
                          }}
                          className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>

                        <button
                          disabled={sIdx === shelves.length - 1}
                          onClick={() => {
                            if (sIdx === shelves.length - 1) return;
                            const updated = [...shelves];
                            const temp = updated[sIdx + 1];
                            updated[sIdx + 1] = updated[sIdx];
                            updated[sIdx] = temp;
                            setShelves(updated);
                          }}
                          className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>

                        {shelf.type === "custom" && (
                          <button
                            onClick={() => {
                              if (confirm(`Delete custom shelf "${shelf.name}"?`)) {
                                setShelves(shelves.filter((s) => s.id !== shelf.id));
                              }
                            }}
                            className="p-1 bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-800 rounded"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Shelf Content / Titles */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Assigned Titles ({shelf.assetIds.length}) & Pinned ({shelf.pinnedAssetIds.length})</span>
                        <div className="flex items-center gap-2">
                          <select
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) return;
                              if (!shelf.assetIds.includes(val)) {
                                const updated = [...shelves];
                                updated[sIdx].assetIds.push(val);
                                setShelves(updated);
                              }
                              e.target.value = "";
                            }}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-2xs text-white"
                          >
                            <option value="">+ Add Title to Shelf...</option>
                            {assets
                              .filter((a) => !shelf.assetIds.includes(a.id))
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.title} ({a.category})
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      {shelf.assetIds.length === 0 ? (
                        <div className="p-3 bg-slate-950/60 border border-dashed border-slate-800 rounded text-center text-xs text-slate-500">
                          {shelf.type === "trending"
                            ? "Dynamic system aggregation active. You can pin manual priority titles above."
                            : shelf.type === "new_releases"
                            ? "Dynamic chronological releases active. Manual overrides can be pinned."
                            : "No manual titles assigned yet. Select from the dropdown above to add."}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {shelf.assetIds.map((assetId) => {
                            const isPinned = shelf.pinnedAssetIds.includes(assetId);
                            const assetObj = assets.find((a) => a.id === assetId);
                            return (
                              <div
                                key={assetId}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border ${
                                  isPinned
                                    ? "bg-amber-950/40 border-amber-800/80 text-amber-200"
                                    : "bg-slate-950 border-slate-800 text-slate-300"
                                }`}
                              >
                                <span className="font-semibold">{assetObj ? assetObj.title : assetId}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...shelves];
                                    const pinned = new Set(updated[sIdx].pinnedAssetIds);
                                    if (pinned.has(assetId)) pinned.delete(assetId);
                                    else pinned.add(assetId);
                                    updated[sIdx].pinnedAssetIds = Array.from(pinned);
                                    setShelves(updated);
                                  }}
                                  title={isPinned ? "Unpin title" : "Pin title to front of row"}
                                  className={`p-0.5 rounded hover:bg-slate-800 ${isPinned ? "text-amber-400" : "text-slate-500"}`}
                                >
                                  <Pin className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...shelves];
                                    updated[sIdx].assetIds = updated[sIdx].assetIds.filter((id) => id !== assetId);
                                    updated[sIdx].pinnedAssetIds = updated[sIdx].pinnedAssetIds.filter((id) => id !== assetId);
                                    setShelves(updated);
                                  }}
                                  title="Remove from shelf"
                                  className="text-slate-500 hover:text-red-400 p-0.5"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ConsoleCard>
          </div>
        )}

        {/* TAB 3: FEATURED HERO ROTATION */}
        {activeTab === "HERO_ROTATION" && (
          <div className="space-y-6">
            <ConsoleCard
              title="Featured Hero Carousel & Schedules"
              actions={
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setHeroFormAssetId("");
                      setHeroFormTitle("");
                      setHeroFormHeadline("");
                      setHeroFormTagline("");
                      setHeroFormCtaText("Watch Now");
                      setHeroFormCtaUrl("/");
                      setHeroFormBannerUrl("");
                      setHeroFormBadgeText("Exclusive Premiere");
                      setHeroFormStartDate("");
                      setHeroFormEndDate("");
                      setHeroFormStatus("ACTIVE");
                      setShowHeroModal(true);
                    }}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Hero Banner</span>
                  </button>
                  <button
                    onClick={handleSaveHeroes}
                    disabled={submittingAction}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded text-xs font-bold flex items-center gap-1.5"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Save Carousel</span>
                  </button>
                </div>
              }
            >
              <p className="text-xs text-slate-400 mb-4">
                The top homepage hero rotates scheduled promotional banners for prestige releases, high-priority movies, and exclusive streams.
              </p>

              {heroes.length === 0 ? (
                <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-2">
                  <Sparkles className="w-8 h-8 text-amber-400 mx-auto" />
                  <div className="text-white font-bold text-sm">No Featured Hero Slides</div>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Create the first hero carousel item to showcase flagship movies and premiere titles.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {heroes.map((hero, hIdx) => (
                    <div
                      key={hero.id}
                      className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col md:flex-row gap-4 justify-between items-start md:items-center"
                    >
                      <div className="flex items-start gap-4">
                        {hero.bannerUrl ? (
                          <img src={hero.bannerUrl} alt="" className="w-24 h-14 object-cover rounded bg-slate-950 border border-slate-800" />
                        ) : (
                          <div className="w-24 h-14 rounded bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600">
                            <Sparkles className="w-5 h-5 text-amber-500/50" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{hero.headline || hero.title}</span>
                            <span className="px-2 py-0.5 rounded text-2xs font-bold bg-amber-950 text-amber-300 border border-amber-800">
                              {hero.badgeText}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-2xs font-bold ${
                                hero.status === "ACTIVE"
                                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                  : hero.status === "SCHEDULED"
                                  ? "bg-blue-950 text-blue-300 border border-blue-800"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {hero.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-300 mt-0.5">{hero.tagline}</div>
                          <div className="text-2xs text-slate-400 mt-1 flex flex-wrap gap-3">
                            <span>Target: <code>{hero.assetId}</code></span>
                            <span>Button: <strong>{hero.ctaText}</strong> ({hero.ctaUrl})</span>
                            {hero.startDate && <span>From: {new Date(hero.startDate).toLocaleDateString()}</span>}
                            {hero.endDate && <span>To: {new Date(hero.endDate).toLocaleDateString()}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center">
                        <button
                          disabled={hIdx === 0}
                          onClick={() => {
                            if (hIdx === 0) return;
                            const updated = [...heroes];
                            const temp = updated[hIdx - 1];
                            updated[hIdx - 1] = updated[hIdx];
                            updated[hIdx] = temp;
                            setHeroes(updated);
                          }}
                          className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          disabled={hIdx === heroes.length - 1}
                          onClick={() => {
                            if (hIdx === heroes.length - 1) return;
                            const updated = [...heroes];
                            const temp = updated[hIdx + 1];
                            updated[hIdx + 1] = updated[hIdx];
                            updated[hIdx] = temp;
                            setHeroes(updated);
                          }}
                          className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove hero banner "${hero.headline}"?`)) {
                              setHeroes(heroes.filter((h) => h.id !== hero.id));
                            }
                          }}
                          className="p-1.5 bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-800 rounded"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ConsoleCard>
          </div>
        )}

        {/* TAB 4: REGIONAL & PRICING OVERRIDES */}
        {activeTab === "CURATION_OVERRIDES" && (
          <div className="space-y-6">
            <ConsoleCard title="Movie Curation, Regional Availability & Monetization Overrides">
              <div className="space-y-4">
                <p className="text-xs text-slate-400">
                  Select a title from the catalogue to configure its priority ranking, category tags, similar movie recommendations, regional availability windows (country whitelists/blacklists), and price per minute overrides.
                </p>

                {/* Movie Picker */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Select Catalogue Title to Override:
                  </label>
                  <select
                    value={selectedMovieForOverride}
                    onChange={(e) => setSelectedMovieForOverride(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">-- Choose Movie or Series from Catalogue --</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} ({a.category}) — ID: {a.id}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedMovieForOverride && (
                  <div className="pt-4 border-t border-slate-800 space-y-6 text-xs">
                    {/* Pin & Rank, Tags */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block font-semibold text-slate-300 mb-1">
                          Pin & Rank Priority (0 - 1000):
                        </label>
                        <input
                          type="number"
                          value={overridePinRank}
                          onChange={(e) => setOverridePinRank(parseInt(e.target.value) || 0)}
                          placeholder="e.g. 50"
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                        />
                        <span className="text-2xs text-slate-500">Higher numbers sort earlier in discovery feeds.</span>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-300 mb-1">
                          Curated Tags (comma-separated):
                        </label>
                        <input
                          type="text"
                          value={overrideTags}
                          onChange={(e) => setOverrideTags(e.target.value)}
                          placeholder="Blockbuster, Nollywood, Thriller, Award-Winner"
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                        />
                      </div>
                    </div>

                    {/* Similar Titles Override */}
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        Manual Similar-Titles Override (More Like This):
                      </label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {overrideSimilarIds.map((simId) => {
                          const simAsset = assets.find((a) => a.id === simId);
                          return (
                            <span
                              key={simId}
                              className="px-2.5 py-1 bg-slate-800 text-slate-200 rounded-lg flex items-center gap-1.5"
                            >
                              <span>{simAsset ? simAsset.title : simId}</span>
                              <button
                                onClick={() => setOverrideSimilarIds(overrideSimilarIds.filter((id) => id !== simId))}
                                className="text-slate-400 hover:text-red-400"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>

                      <select
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && !overrideSimilarIds.includes(val)) {
                            setOverrideSimilarIds([...overrideSimilarIds, val]);
                          }
                          e.target.value = "";
                        }}
                        className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                      >
                        <option value="">+ Pick similar movie to recommend...</option>
                        {assets
                          .filter((a) => a.id !== selectedMovieForOverride && !overrideSimilarIds.includes(a.id))
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.title}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Regional Availability Windows */}
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                      <div className="font-bold text-white flex items-center gap-2">
                        <Globe className="w-4 h-4 text-emerald-400" />
                        <span>Regional Availability Windows (Geo-Fencing)</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-semibold text-slate-300 mb-1">Geographic Mode:</label>
                          <select
                            value={overrideRegionMode}
                            onChange={(e) => setOverrideRegionMode(e.target.value as any)}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                          >
                            <option value="GLOBAL">Global (Available Everywhere)</option>
                            <option value="WHITELIST">Whitelist (Only Selected Countries)</option>
                            <option value="BLACKLIST">Blacklist (Block Selected Countries)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-300 mb-1">Country ISO Codes (e.g. NG, GH, US):</label>
                          <input
                            type="text"
                            disabled={overrideRegionMode === "GLOBAL"}
                            value={overrideCountries}
                            onChange={(e) => setOverrideCountries(e.target.value)}
                            placeholder="NG, GH, KE, US, GB"
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white disabled:opacity-30"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-300 mb-1">Window Range:</label>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="date"
                              value={overrideAvailableFrom}
                              onChange={(e) => setOverrideAvailableFrom(e.target.value)}
                              className="px-2 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                            />
                            <input
                              type="date"
                              value={overrideAvailableTo}
                              onChange={(e) => setOverrideAvailableTo(e.target.value)}
                              className="px-2 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pricing & Free Preview Overrides */}
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                      <div className="font-bold text-white flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-cyan-400" />
                        <span>Monetization & Free Preview Overrides</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block font-semibold text-slate-300 mb-1">
                            Price Per Minute Override (NGN ₦):
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={overridePricePerMin}
                            onChange={(e) => setOverridePricePerMin(e.target.value)}
                            placeholder="e.g. 2.50 (leave empty for channel default)"
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                          />
                          <span className="text-2xs text-slate-500">Overrides standard channel price per stream minute.</span>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-300 mb-1">
                            Free Preview Minutes:
                          </label>
                          <input
                            type="number"
                            value={overrideFreeMins}
                            onChange={(e) => setOverrideFreeMins(parseInt(e.target.value) || 0)}
                            placeholder="e.g. 5"
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                          />
                          <span className="text-2xs text-slate-500">Number of minutes a viewer can watch before billing starts.</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleSaveMovieCuration}
                        disabled={submittingAction}
                        className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-2"
                      >
                        <CheckSquare className="w-4 h-4" />
                        <span>Save Curation Overrides</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </ConsoleCard>
          </div>
        )}

        {/* Modal: New Hero Item */}
        {showHeroModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  Create Featured Hero Slide
                </h3>
                <button onClick={() => setShowHeroModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Target Movie / Title:</label>
                  <select
                    value={heroFormAssetId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setHeroFormAssetId(id);
                      const found = assets.find((a) => a.id === id);
                      if (found) {
                        setHeroFormTitle(found.title);
                        if (!heroFormHeadline) setHeroFormHeadline(`Watch ${found.title}`);
                        if (!heroFormBannerUrl && found.posterUrl) setHeroFormBannerUrl(found.posterUrl);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  >
                    <option value="">-- Choose Movie from Catalogue --</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Headline:</label>
                  <input
                    type="text"
                    value={heroFormHeadline}
                    onChange={(e) => setHeroFormHeadline(e.target.value)}
                    placeholder="e.g. Stream The Nollywood Premiere of the Year"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Tagline:</label>
                  <input
                    type="text"
                    value={heroFormTagline}
                    onChange={(e) => setHeroFormTagline(e.target.value)}
                    placeholder="e.g. Betrayal. Power. Unstoppable loyalty."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Button CTA Text:</label>
                    <input
                      type="text"
                      value={heroFormCtaText}
                      onChange={(e) => setHeroFormCtaText(e.target.value)}
                      placeholder="Watch Now"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Badge Text:</label>
                    <input
                      type="text"
                      value={heroFormBadgeText}
                      onChange={(e) => setHeroFormBadgeText(e.target.value)}
                      placeholder="Exclusive Premiere"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Banner Image URL:</label>
                  <input
                    type="url"
                    value={heroFormBannerUrl}
                    onChange={(e) => setHeroFormBannerUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Start Date:</label>
                    <input
                      type="datetime-local"
                      value={heroFormStartDate}
                      onChange={(e) => setHeroFormStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">End Date:</label>
                    <input
                      type="datetime-local"
                      value={heroFormEndDate}
                      onChange={(e) => setHeroFormEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowHeroModal(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!heroFormAssetId || !heroFormHeadline}
                  onClick={() => {
                    const newHero: FeaturedHero = {
                      id: `hero_${Date.now()}`,
                      assetId: heroFormAssetId,
                      title: heroFormTitle || heroFormHeadline,
                      headline: heroFormHeadline,
                      tagline: heroFormTagline,
                      ctaText: heroFormCtaText,
                      ctaUrl: heroFormCtaUrl || `/content/${heroFormAssetId}`,
                      bannerUrl: heroFormBannerUrl,
                      badgeText: heroFormBadgeText,
                      rank: heroes.length + 1,
                      startDate: heroFormStartDate || null,
                      endDate: heroFormEndDate || null,
                      status: heroFormStatus,
                      updatedAt: new Date().toISOString(),
                    };
                    setHeroes([...heroes, newHero]);
                    setShowHeroModal(false);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded font-bold"
                >
                  Add to Carousel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Preview Player */}
        {previewAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Play className="w-5 h-5 text-cyan-400" />
                  Preview: {previewAsset.title}
                </h3>
                <button onClick={() => setPreviewAsset(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border border-slate-800">
                {previewAsset.masterPlaylistUrl ? (
                  <video
                    src={previewAsset.masterPlaylistUrl}
                    controls
                    className="w-full h-full"
                    autoPlay
                  />
                ) : (
                  <div className="text-slate-500 text-center p-4">
                    <Film className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                    <span>Playback URL not yet verified or processed.</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center text-slate-400 pt-2">
                <span>Asset ID: <code>{previewAsset.id}</code></span>
                <button
                  onClick={() => setPreviewAsset(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded font-semibold"
                >
                  Close Preview
                </button>
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
                  <Edit className="w-5 h-5 text-cyan-400" />
                  Edit Movie Details: {editingAsset.title}
                </h3>
                <button onClick={() => setEditingAsset(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Title:</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Description:</label>
                  <textarea
                    rows={3}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Category:</label>
                    <input
                      type="text"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Age Rating:</label>
                    <select
                      value={editAgeRating}
                      onChange={(e) => setEditAgeRating(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    >
                      <option value="G">G - General</option>
                      <option value="PG">PG - Parental Guidance</option>
                      <option value="12">12 - Twelve & Above</option>
                      <option value="15">15 - Fifteen & Above</option>
                      <option value="18">18 - Adults Only</option>
                    </select>
                  </div>
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
                  onClick={() => {
                    const reason = prompt("Enter reason for editing metadata:");
                    if (!reason || reason.trim().length < 3) return;
                    executeAction(editingAsset.id, {
                      action: "edit_details",
                      title: editTitle.trim(),
                      description: editDesc.trim(),
                      category: editCategory.trim(),
                      ageRating: editAgeRating,
                      reason: reason.trim(),
                    });
                    setEditingAsset(null);
                  }}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Takedown Notice */}
        {takedownAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-red-400 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5" />
                  Copyright Takedown: {takedownAsset.title}
                </h3>
                <button onClick={() => setTakedownAsset(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Claimant / Rights Holder:</label>
                  <input
                    type="text"
                    value={takedownClaimant}
                    onChange={(e) => setTakedownClaimant(e.target.value)}
                    placeholder="e.g. Acme Rights Corp"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Complaint / Legal Reference:</label>
                  <input
                    type="text"
                    value={takedownRef}
                    onChange={(e) => setTakedownRef(e.target.value)}
                    placeholder="e.g. DMCA-2026-991"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Reason & Legal Context:</label>
                  <textarea
                    rows={3}
                    value={takedownReason}
                    onChange={(e) => setTakedownReason(e.target.value)}
                    placeholder="Provide detailed legal notice justification..."
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
