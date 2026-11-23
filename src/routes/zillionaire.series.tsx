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
  Clapperboard,
  Search,
  Play,
  Plus,
  Edit,
  Trash2,
  Clock,
  ArrowUp,
  ArrowDown,
  Layers,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Video,
  ListPlus,
  Sparkles,
  ChevronRight,
  Shield,
  Tag,
  Users,
  Eye,
  SkipForward,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/series")({
  component: ZillionaireSeriesRoute,
  head: () => ({
    meta: [
      { title: "Series & Episodic Content | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface CastCrewItem {
  name: string;
  role: string;
}

interface Episode {
  id: string;
  seriesId: string;
  seasonId: string;
  episodeNumber: number;
  title: string;
  description: string;
  durationMinutes: number;
  videoAssetId?: string;
  skipIntroSeconds?: number;
  nextEpisodeOffsetSeconds?: number;
  ageRatingOverride?: string;
  status: "DRAFT" | "READY" | "PUBLISHED" | "COMING_SOON";
  scheduledReleaseAt?: string;
}

interface Season {
  id: string;
  seriesId: string;
  seasonNumber: number;
  title: string;
  description?: string;
  episodes: Episode[];
}

interface Series {
  id: string;
  title: string;
  description: string;
  channelId: string;
  genre: string;
  ageRating: string;
  posterUrl?: string;
  backdropUrl?: string;
  trailerUrl?: string;
  cast: CastCrewItem[];
  crew: CastCrewItem[];
  status: "DRAFT" | "PUBLISHED" | "COMING_SOON" | "ARCHIVED";
  scheduledReleaseAt?: string;
  seasons: Season[];
  createdAt: string;
  updatedAt: string;
}

function ZillionaireSeriesRoute() {
  return (
    <ConsolePageGuard
      role="zillionaire"
      module="content"
      title="Series & Episodic Studio"
      description="Manage episodic shows, seasons, skip-intro markers, bulk auto-numbering, and scheduled releases."
    >
      {({ token, account, onLock }) => (
        <ZillionaireSeriesPage token={token} account={account} {...(onLock ? { onLock } : {})} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionaireSeriesPage({
  token,
  account,
  onLock,
}: {
  token: string;
  account: { uid: string; email?: string | null; roles?: string[]; modules?: string[]; isOwner?: boolean } | null;
  onLock?: () => void;
}) {
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  // Modals
  const [showCreateSeriesModal, setShowCreateSeriesModal] = useState(false);
  const [showCreateSeasonModal, setShowCreateSeasonModal] = useState(false);
  const [showCreateEpisodeModal, setShowCreateEpisodeModal] = useState(false);
  const [showBulkEpisodeModal, setShowBulkEpisodeModal] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);

  // Form states
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formChannelId, setFormChannelId] = useState("bq_sqwad_library");
  const [formGenre, setFormGenre] = useState("Drama");
  const [formAgeRating, setFormAgeRating] = useState("13+");
  const [formPosterUrl, setFormPosterUrl] = useState("");
  const [formTrailerUrl, setFormTrailerUrl] = useState("");
  const [formStatus, setFormStatus] = useState<"DRAFT" | "PUBLISHED" | "COMING_SOON">("DRAFT");
  const [formReason, setFormReason] = useState("Initial setup");

  // Season form
  const [seasonNum, setSeasonNum] = useState(1);
  const [seasonTitle, setSeasonTitle] = useState("Season 1");

  // Episode form
  const [epNum, setEpNum] = useState(1);
  const [epTitle, setEpTitle] = useState("");
  const [epDuration, setEpDuration] = useState(45);
  const [epSkipIntro, setEpSkipIntro] = useState(0);
  const [epNextOffset, setEpNextOffset] = useState(30);
  const [epAgeOverride, setEpAgeOverride] = useState("");
  const [epStatus, setEpStatus] = useState<"DRAFT" | "READY" | "PUBLISHED" | "COMING_SOON">("DRAFT");
  const [epSchedule, setEpSchedule] = useState("");

  // Bulk form
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkPrefix, setBulkPrefix] = useState("Episode");
  const [bulkDuration, setBulkDuration] = useState(45);
  const [bulkSkipIntro, setBulkSkipIntro] = useState(60);
  const [bulkNextOffset, setBulkNextOffset] = useState(30);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/series/", { headers });
      if (res.ok) {
        const data = await res.json();
        setSeriesList(data.series || []);
        if (data.series?.length > 0 && !selectedSeriesId) {
          setSelectedSeriesId(data.series[0].id);
          if (data.series[0].seasons?.length > 0) {
            setSelectedSeasonId(data.series[0].seasons[0].id);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load series:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const selectedSeries = useMemo(() => {
    return seriesList.find((s) => s.id === selectedSeriesId) || null;
  }, [seriesList, selectedSeriesId]);

  const selectedSeason = useMemo(() => {
    if (!selectedSeries) return null;
    return selectedSeries.seasons.find((sn) => sn.id === selectedSeasonId) || selectedSeries.seasons[0] || null;
  }, [selectedSeries, selectedSeasonId]);

  // Statistics
  const totalSeriesCount = seriesList.length;
  const totalSeasonsCount = seriesList.reduce((acc, s) => acc + s.seasons.length, 0);
  const totalEpisodesCount = seriesList.reduce((acc, s) => acc + s.seasons.reduce((eAcc, sn) => eAcc + sn.episodes.length, 0), 0);
  const comingSoonCount = seriesList.reduce(
    (acc, s) => acc + s.seasons.reduce((eAcc, sn) => eAcc + sn.episodes.filter((e) => e.status === "COMING_SOON").length, 0),
    0
  );

  const handleCreateSeries = async () => {
    if (!formTitle.trim()) return;
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/series/", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_SERIES",
          title: formTitle,
          description: formDesc,
          channelId: formChannelId,
          genre: formGenre,
          ageRating: formAgeRating,
          posterUrl: formPosterUrl || undefined,
          trailerUrl: formTrailerUrl || undefined,
          status: formStatus,
          reason: formReason || "Owner created series",
        }),
      });

      if (res.ok) {
        showToast("Series created successfully!");
        setShowCreateSeriesModal(false);
        setFormTitle("");
        setFormDesc("");
        await loadData();
      } else {
        const err = await res.json();
        alert(err.message || "Failed to create series");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateSeason = async () => {
    if (!selectedSeries) return;
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/series/", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_SEASON",
          seriesId: selectedSeries.id,
          seasonNumber: seasonNum,
          title: seasonTitle,
          reason: formReason || "Added new season",
        }),
      });

      if (res.ok) {
        showToast("Season added!");
        setShowCreateSeasonModal(false);
        await loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateEpisode = async () => {
    if (!selectedSeries || !selectedSeason || !epTitle.trim()) return;
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/series/", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_EPISODE",
          seriesId: selectedSeries.id,
          seasonId: selectedSeason.id,
          episodeNumber: epNum,
          title: epTitle,
          durationMinutes: epDuration,
          skipIntroSeconds: epSkipIntro || undefined,
          nextEpisodeOffsetSeconds: epNextOffset || undefined,
          ageRatingOverride: epAgeOverride || undefined,
          status: epStatus,
          scheduledReleaseAt: epSchedule || undefined,
          reason: formReason || "Owner created episode",
        }),
      });

      if (res.ok) {
        showToast("Episode created!");
        setShowCreateEpisodeModal(false);
        setEpTitle("");
        await loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkEpisodes = async () => {
    if (!selectedSeries || !selectedSeason) return;
    try {
      const episodesPayload = [];
      const start = selectedSeason.episodes.length + 1;
      for (let i = 0; i < bulkCount; i++) {
        episodesPayload.push({
          title: `${bulkPrefix} ${start + i}`,
          durationMinutes: bulkDuration,
          skipIntroSeconds: bulkSkipIntro,
          nextEpisodeOffsetSeconds: bulkNextOffset,
          status: "DRAFT" as const,
        });
      }

      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/series/", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BULK_CREATE_EPISODES",
          seriesId: selectedSeries.id,
          seasonId: selectedSeason.id,
          startNumber: start,
          episodes: episodesPayload,
          reason: formReason || "Bulk batch auto-numbering",
        }),
      });

      if (res.ok) {
        showToast(`Created ${bulkCount} episodes automatically!`);
        setShowBulkEpisodeModal(false);
        await loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMoveEpisode = async (episodeId: string, direction: "UP" | "DOWN") => {
    if (!selectedSeries || !selectedSeason) return;
    const eps = [...selectedSeason.episodes];
    const idx = eps.findIndex((e) => e.id === episodeId);
    if (idx === -1) return;
    if (direction === "UP" && idx === 0) return;
    if (direction === "DOWN" && idx === eps.length - 1) return;

    const targetIdx = direction === "UP" ? idx - 1 : idx + 1;
    const temp = eps[idx];
    const target = eps[targetIdx];
    if (!temp || !target) return;
    eps[idx] = target;
    eps[targetIdx] = temp;

    const episodeOrder = eps.map((e) => e.id);

    try {
      const headers = await getWebAuthHeaders(token);
      await fetch("/api/public/v1/zillionaire/series/", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REORDER_EPISODES",
          seriesId: selectedSeries.id,
          seasonId: selectedSeason.id,
          episodeOrder,
          reason: "Manual order adjustment",
        }),
      });
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteEpisode = async (episodeId: string) => {
    if (!selectedSeries || !selectedSeason) return;
    if (!window.confirm("Remove this episode from the series? Its uploaded media file will remain in the content library.")) return;
    const reason = window.prompt("Why are you removing this episode? (at least 3 characters)", "Remove test or incorrect episode");
    if (!reason || reason.trim().length < 3) return;
    try {
      const headers = await getWebAuthHeaders(token);
      const response = await fetch("/api/public/v1/zillionaire/series/", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE_EPISODE", seriesId: selectedSeries.id, seasonId: selectedSeason.id, episodeId, reason: reason.trim() }),
      });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.message || data.error || "The episode could not be removed.");
      showToast("Episode removed");
      await loadData();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The episode could not be removed.");
    }
  };

  const handleDeleteSeries = async () => {
    if (!selectedSeries) return;
    if (!window.confirm("Delete this series and its season/episode listing? Uploaded media files remain in the content library and are not permanently erased.")) return;
    const reason = window.prompt("Why are you deleting this series? (at least 3 characters)", "Remove test or incorrect series");
    if (!reason || reason.trim().length < 3) return;
    try {
      const headers = await getWebAuthHeaders(token);
      const response = await fetch("/api/public/v1/zillionaire/series/", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE_SERIES", seriesId: selectedSeries.id, reason: reason.trim() }),
      });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.message || data.error || "The series could not be deleted.");
      const remaining = seriesList.filter((item) => item.id !== selectedSeries.id);
      setSeriesList(remaining);
      setSelectedSeriesId(remaining[0]?.id ?? null);
      setSelectedSeasonId(remaining[0]?.seasons?.[0]?.id ?? null);
      showToast("Series removed. Uploaded media files remain in the content library.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The series could not be deleted.");
    }
  };

  return (
    <ConsoleShell
      title="Series & Episodes Studio"
      subtitle="Complete episodic pipeline: seasons, bulk auto-numbering, skip markers, and releases."
      consoleType="zillionaire"
      activePath="/zillionaire/series"
      account={account}
      onLock={onLock}
    >
      <div className="space-y-6">
        {toastMessage && (
          <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-sm flex items-center justify-between">
            <span>{toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="text-emerald-400 hover:text-white font-bold">✕</button>
          </div>
        )}

        {/* Welcome Banner */}
        <ConsoleWelcomeBanner
          title="Episodic Programming Studio"
          description="Create series, organize multi-season catalogues, set intro/outro skip timestamps, and schedule seasonal drops."
          primaryAction={{
            label: "+ New Series",
            onClick: () => {
              setFormTitle("");
              setFormDesc("");
              setShowCreateSeriesModal(true);
            },
          }}
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ConsoleKpiCard
            title="Total Series"
            value={totalSeriesCount}
            variant="blue"
            icon={Layers}
            caption="Published catalogues"
          />
          <ConsoleKpiCard
            title="Total Seasons"
            value={totalSeasonsCount}
            variant="purple"
            icon={Clapperboard}
            caption="Season structures"
          />
          <ConsoleKpiCard
            title="Total Episodes"
            value={totalEpisodesCount}
            variant="green"
            icon={Film}
            caption="Active assets"
          />
          <ConsoleKpiCard
            title="Coming Soon / Sched."
            value={comingSoonCount}
            variant="gold"
            icon={Clock}
            caption="Future releases"
          />
        </div>

        {/* Main 2-column workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Series list on left */}
          <div className="lg:col-span-4 space-y-4">
            <ConsoleCard title="Series Library" subtitle="Select a show to manage">
              <div className="space-y-3 mt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search shows..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {seriesList
                    .filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((s) => {
                      const isSelected = s.id === selectedSeriesId;
                      return (
                        <div
                          key={s.id}
                          onClick={() => {
                            setSelectedSeriesId(s.id);
                            if (s.seasons[0]) {
                              setSelectedSeasonId(s.seasons[0].id);
                            } else {
                              setSelectedSeasonId(null);
                            }
                          }}
                          className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? "bg-blue-600/20 border-blue-500/80 text-white"
                              : "bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700"
                          }`}
                        >
                          <div className="space-y-1">
                            <h4 className="font-semibold text-sm">{s.title}</h4>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <span>{s.genre}</span>
                              <span>•</span>
                              <span>{s.seasons.length} Seasons</span>
                              <span>•</span>
                              <span className="text-amber-400 font-mono">{s.ageRating}</span>
                            </div>
                          </div>
                          <ConsoleStatusBadge
                            status={s.status === "PUBLISHED" ? "ACTIVE" : s.status === "COMING_SOON" ? "PENDING" : "INACTIVE"}
                            text={s.status}
                          />
                        </div>
                      );
                    })}

                  {seriesList.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      No series found. Click "+ New Series" above to create your first show.
                    </div>
                  )}
                </div>
              </div>
            </ConsoleCard>
          </div>

          {/* Details & Episodes on right */}
          <div className="lg:col-span-8 space-y-6">
            {selectedSeries ? (
              <>
                {/* Series Header Card */}
                <ConsoleCard>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-white">{selectedSeries.title}</h2>
                        <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                          {selectedSeries.ageRating}
                        </span>
                        <ConsoleStatusBadge
                          status={selectedSeries.status === "PUBLISHED" ? "ACTIVE" : "PENDING"}
                          text={selectedSeries.status}
                        />
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 max-w-xl">{selectedSeries.description}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSeasonNum(selectedSeries.seasons.length + 1);
                          setSeasonTitle(`Season ${selectedSeries.seasons.length + 1}`);
                          setShowCreateSeasonModal(true);
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition"
                      >
                        + Add Season
                      </button>
                      <button type="button" onClick={() => void handleDeleteSeries()} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-semibold rounded-lg text-rose-300 transition">
                        <Trash2 className="h-3.5 w-3.5" /> Delete Series
                      </button>
                    </div>
                  </div>

                  {/* Season Selector Tabs */}
                  <div className="flex items-center gap-2 border-b border-slate-800 pt-6 pb-2 overflow-x-auto">
                    {selectedSeries.seasons.map((sn) => {
                      const isActive = sn.id === (selectedSeason?.id ?? "");
                      return (
                        <button
                          key={sn.id}
                          onClick={() => setSelectedSeasonId(sn.id)}
                          className={`px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                            isActive
                              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                              : "bg-slate-800/60 text-slate-400 hover:text-white"
                          }`}
                        >
                          Season {sn.seasonNumber} ({sn.episodes.length} eps)
                        </button>
                      );
                    })}

                    {selectedSeries.seasons.length === 0 && (
                      <span className="text-xs text-slate-500 italic">No seasons yet. Tap "+ Add Season".</span>
                    )}
                  </div>
                </ConsoleCard>

                {/* Episodes Table Card */}
                {selectedSeason && (
                  <ConsoleCard
                    title={`Season ${selectedSeason.seasonNumber} Episodes`}
                    subtitle={`Manage ${selectedSeason.episodes.length} episodes with drag reorder, intro skips, and status.`}
                    action={
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setBulkCount(10);
                            setBulkPrefix("Episode");
                            setShowBulkEpisodeModal(true);
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition flex items-center gap-1.5"
                        >
                          <ListPlus className="w-3.5 h-3.5 text-blue-400" />
                          Bulk Auto-Number
                        </button>
                        <button
                          onClick={() => {
                            setEpNum(selectedSeason.episodes.length + 1);
                            setEpTitle(`Episode ${selectedSeason.episodes.length + 1}`);
                            setShowCreateEpisodeModal(true);
                          }}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          New Episode
                        </button>
                      </div>
                    }
                  >
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            <th className="py-3 px-3">Order</th>
                            <th className="py-3 px-3">Episode</th>
                            <th className="py-3 px-3">Duration</th>
                            <th className="py-3 px-3">Skip Markers</th>
                            <th className="py-3 px-3">Age Rating</th>
                            <th className="py-3 px-3">Status</th>
                            <th className="py-3 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-xs">
                          {selectedSeason.episodes.map((ep, idx) => (
                            <tr key={ep.id} className="hover:bg-slate-800/30 transition group">
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-1">
                                  <button
                                    disabled={idx === 0}
                                    onClick={() => handleMoveEpisode(ep.id, "UP")}
                                    className="p-1 hover:bg-slate-700 rounded disabled:opacity-20 text-slate-400 hover:text-white"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    disabled={idx === selectedSeason.episodes.length - 1}
                                    onClick={() => handleMoveEpisode(ep.id, "DOWN")}
                                    className="p-1 hover:bg-slate-700 rounded disabled:opacity-20 text-slate-400 hover:text-white"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <span className="font-mono text-slate-400 pl-1">{ep.episodeNumber}</span>
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-semibold text-slate-200">{ep.title}</div>
                                {ep.scheduledReleaseAt && (
                                  <div className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5">
                                    <Clock className="w-2.5 h-2.5" />
                                    Release: {new Date(ep.scheduledReleaseAt).toLocaleDateString()}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-slate-300 font-mono">{ep.durationMinutes}m</td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  {ep.skipIntroSeconds ? (
                                    <span className="px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded font-mono text-[10px]">
                                      Intro: {ep.skipIntroSeconds}s
                                    </span>
                                  ) : (
                                    <span className="text-slate-600 text-[10px]">No intro</span>
                                  )}
                                  {ep.nextEpisodeOffsetSeconds ? (
                                    <span className="px-1.5 py-0.5 bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded font-mono text-[10px]">
                                      Next: -{ep.nextEpisodeOffsetSeconds}s
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                {ep.ageRatingOverride ? (
                                  <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded font-mono text-[10px]">
                                    {ep.ageRatingOverride}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 text-[10px]">Inherited</span>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                <ConsoleStatusBadge
                                  status={
                                    ep.status === "PUBLISHED"
                                      ? "ACTIVE"
                                      : ep.status === "READY"
                                      ? "PENDING"
                                      : ep.status === "COMING_SOON"
                                      ? "WARNING"
                                      : "INACTIVE"
                                  }
                                  text={ep.status}
                                />
                              </td>
                              <td className="py-3 px-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleDeleteEpisode(ep.id)}
                                    className="p-1.5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}

                          {selectedSeason.episodes.length === 0 && (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                                No episodes in this season yet. Use "+ Bulk Auto-Number" or "New Episode".
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </ConsoleCard>
                )}
              </>
            ) : (
              <ConsoleCard>
                <div className="py-16 text-center text-slate-400 space-y-3">
                  <Film className="w-12 h-12 mx-auto text-slate-600" />
                  <h3 className="text-sm font-semibold text-slate-300">No Series Selected</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Choose a series from the left panel or click "+ New Series" to start configuring episodic content.
                  </p>
                </div>
              </ConsoleCard>
            )}
          </div>
        </div>

        {/* Create Series Modal */}
        {showCreateSeriesModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-white text-base">Create New Series</h3>
                <button onClick={() => setShowCreateSeriesModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Title *</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Lagos Nights"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Description *</label>
                  <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="Overview of the series synopsis..."
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Genre</label>
                    <select
                      value={formGenre}
                      onChange={(e) => setFormGenre(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                    >
                      <option value="Drama">Drama</option>
                      <option value="Action">Action</option>
                      <option value="Comedy">Comedy</option>
                      <option value="Thriller">Thriller</option>
                      <option value="Documentary">Documentary</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Age Rating</label>
                    <select
                      value={formAgeRating}
                      onChange={(e) => setFormAgeRating(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                    >
                      <option value="G">G - General</option>
                      <option value="PG">PG - Parental Guidance</option>
                      <option value="13+">13+ Teens</option>
                      <option value="16+">16+ Mature</option>
                      <option value="18+">18+ Adults</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="COMING_SOON">Coming Soon</option>
                    <option value="PUBLISHED">Published</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowCreateSeriesModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateSeries}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold text-white"
                >
                  Create Series
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Season Modal */}
        {showCreateSeasonModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-white text-base">Add Season</h3>
                <button onClick={() => setShowCreateSeasonModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Season Number</label>
                  <input
                    type="number"
                    value={seasonNum}
                    onChange={(e) => setSeasonNum(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Season Title</label>
                  <input
                    type="text"
                    value={seasonTitle}
                    onChange={(e) => setSeasonTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowCreateSeasonModal(false)}
                  className="px-3 py-1.5 bg-slate-800 text-xs font-semibold text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateSeason}
                  className="px-3 py-1.5 bg-blue-600 text-xs font-semibold text-white rounded-lg"
                >
                  Add Season
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Single Episode Modal */}
        {showCreateEpisodeModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-white text-base">Create Episode</h3>
                <button onClick={() => setShowCreateEpisodeModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Ep #</label>
                    <input
                      type="number"
                      value={epNum}
                      onChange={(e) => setEpNum(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-slate-300 font-semibold mb-1">Title *</label>
                    <input
                      type="text"
                      value={epTitle}
                      onChange={(e) => setEpTitle(e.target.value)}
                      placeholder="e.g. Pilot"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Duration (mins)</label>
                    <input
                      type="number"
                      value={epDuration}
                      onChange={(e) => setEpDuration(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Skip Intro (secs)</label>
                    <input
                      type="number"
                      value={epSkipIntro}
                      onChange={(e) => setEpSkipIntro(Number(e.target.value))}
                      placeholder="e.g. 60"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Next Ep Offset (secs)</label>
                    <input
                      type="number"
                      value={epNextOffset}
                      onChange={(e) => setEpNextOffset(Number(e.target.value))}
                      placeholder="e.g. 30"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Age Override</label>
                    <select
                      value={epAgeOverride}
                      onChange={(e) => setEpAgeOverride(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                    >
                      <option value="">None (Inherit)</option>
                      <option value="13+">13+</option>
                      <option value="16+">16+</option>
                      <option value="18+">18+</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Status</label>
                    <select
                      value={epStatus}
                      onChange={(e) => setEpStatus(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="READY">Ready</option>
                      <option value="COMING_SOON">Coming Soon</option>
                      <option value="PUBLISHED">Published</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Release Schedule</label>
                    <input
                      type="date"
                      value={epSchedule}
                      onChange={(e) => setEpSchedule(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowCreateEpisodeModal(false)}
                  className="px-3 py-1.5 bg-slate-800 text-xs font-semibold text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateEpisode}
                  className="px-3 py-1.5 bg-blue-600 text-xs font-semibold text-white rounded-lg"
                >
                  Save Episode
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Episode Modal */}
        {showBulkEpisodeModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-white text-base">Bulk Add Episodes</h3>
                <button onClick={() => setShowBulkEpisodeModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Number of Episodes</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={bulkCount}
                    onChange={(e) => setBulkCount(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Title Prefix</label>
                  <input
                    type="text"
                    value={bulkPrefix}
                    onChange={(e) => setBulkPrefix(e.target.value)}
                    placeholder="e.g. Episode"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Duration (mins)</label>
                    <input
                      type="number"
                      value={bulkDuration}
                      onChange={(e) => setBulkDuration(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Intro Skip (s)</label>
                    <input
                      type="number"
                      value={bulkSkipIntro}
                      onChange={(e) => setBulkSkipIntro(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowBulkEpisodeModal(false)}
                  className="px-3 py-1.5 bg-slate-800 text-xs font-semibold text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkEpisodes}
                  className="px-3 py-1.5 bg-blue-600 text-xs font-semibold text-white rounded-lg"
                >
                  Generate {bulkCount} Episodes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
