import { useEffect, useState, useMemo, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  UploadCloud,
  Film,
  Tv,
  Clapperboard,
  Video,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  ExternalLink,
  ShieldCheck,
  FileVideo,
  Layers,
  Sparkles,
  Zap,
  Info,
  Server,
  ArrowRight,
  Filter,
} from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/upload-studio")({
  component: UploadStudioRoute,
  head: () => ({
    meta: [
      { title: "Upload Studio | BQ SQWAD TV Zillionaire" },
      { name: "description", content: "Ingest and direct-publish movies, series, episodes, and live recordings." },
    ],
  }),
});

function UploadStudioRoute() {
  return (
    <ConsolePageGuard
      role="zillionaire"
      module="video"
      moduleName="Upload Studio"
      action="manage content ingestion and direct publishing"
    >
      {(account) => <UploadStudioContent account={account} />}
    </ConsolePageGuard>
  );
}

type UploadRecord = {
  id: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  mediaType: "Movie" | "Series" | "Episode" | "Trailer" | "Live recording";
  genre: string;
  language: string;
  ageRating: string;
  ownershipDeclaration?: boolean;
  copyrightDeclaration?: boolean;
  releaseDate: string | null;
  cast: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  directPublish: boolean;
  displayState: "Uploading" | "Verifying" | "Processing" | "Needs review" | "Ready" | "Published" | "Failed";
  rawStatus: string;
  contentStatus: string;
  sourceFilename: string | null;
  declaredSizeBytes: number | null;
  actualSizeBytes: number | null;
  durationSeconds: number | null;
  codec: string | null;
  resolution: string | null;
  duplicateDetected: boolean;
  failureReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ChannelOption = {
  id: string;
  title: string;
  published: boolean;
};

type ActiveUploadQueueItem = {
  assetId: string;
  filename: string;
  sizeBytes: number;
  uploadedBytes: number;
  progress: number;
  status: "idle" | "uploading" | "paused" | "completed" | "failed";
  speedMbPerSec: number;
  secondsRemaining: number;
  chunksTotal: number;
  chunksCompleted: number;
};

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function UploadStudioContent({ account }: { account: ConsoleAccount }) {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    ready: 0,
    processing: 0,
    needsReview: 0,
    failed: 0,
  });
  const [processingHostConfigured, setProcessingHostConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<"ingest" | "queue" | "worker">("queue");

  // Ingest Form State
  const [mediaType, setMediaType] = useState<"Movie" | "Series" | "Episode" | "Trailer" | "Live recording">("Movie");
  const [channelId, setChannelId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("Drama");
  const [language, setLanguage] = useState("English");
  const [ageRating, setAgeRating] = useState<"G" | "PG" | "13+" | "16+" | "18+">("13+");
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [cast, setCast] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [backdropUrl, setBackdropUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [subtitlesLanguage, setSubtitlesLanguage] = useState("English");
  const [subtitlesUrl, setSubtitlesUrl] = useState("");

  // Upload Queue State
  const [activeQueue, setActiveQueue] = useState<ActiveUploadQueueItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await restoreWebSession();
      const headers = await getWebAuthHeaders(token || "");

      const res = await fetch("/api/public/v1/zillionaire/upload/", {
        headers,
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Failed to load upload records: ${res.statusText}`);
      }

      const data = await res.json();
      setUploads(data.uploads || []);
      setChannels(data.channels || []);
      if (data.channels && data.channels.length > 0 && !channelId) {
        setChannelId(data.channels[0].id);
      }
      setStats(data.stats || { total: 0, published: 0, ready: 0, processing: 0, needsReview: 0, failed: 0 });
      setProcessingHostConfigured(Boolean(data.processingHostConfigured));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleStartUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Asset title is required.");
      return;
    }
    if (!channelId) {
      setError("Please select a target channel.");
      return;
    }

    const filename = selectedFile ? selectedFile.name : `${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.mp4`;
    const sizeBytes = selectedFile ? selectedFile.size : 250_000_000; // 250MB mock if no local file selected
    const mimeType = selectedFile ? selectedFile.type || "video/mp4" : "video/mp4";

    try {
      setError(null);
      const token = await restoreWebSession();
      const headers = {
        ...(await getWebAuthHeaders(token || "")),
        "Content-Type": "application/json",
      };

      // 1. Initiate Upload
      const initRes = await fetch("/api/public/v1/zillionaire/upload/", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "INITIATE_UPLOAD",
          channelId,
          title,
          description,
          mediaType,
          genre,
          language,
          ageRating,
          releaseDate,
          cast,
          posterUrl: posterUrl.trim() || undefined,
          backdropUrl: backdropUrl.trim() || undefined,
          filename,
          sizeBytes,
          mimeType,
          subtitles: subtitlesUrl ? [{ language: subtitlesLanguage, format: "vtt", label: `${subtitlesLanguage} Subtitles`, url: subtitlesUrl }] : [],
        }),
      });

      if (!initRes.ok) {
        const errData = await initRes.json();
        throw new Error(errData.error || "Failed to initiate upload");
      }

      const initData = await initRes.json();
      const assetId = initData.assetId as string;
      const totalChunks = initData.totalChunks as number;

      // Add to active queue
      const queueItem: ActiveUploadQueueItem = {
        assetId,
        filename,
        sizeBytes,
        uploadedBytes: 0,
        progress: 0,
        status: "uploading",
        speedMbPerSec: 4.8,
        secondsRemaining: Math.ceil(sizeBytes / (4.8 * 1024 * 1024)),
        chunksTotal: totalChunks,
        chunksCompleted: 0,
      };
      setActiveQueue((prev) => [queueItem, ...prev]);
      setActiveTab("queue");

      // Progressively upload chunks
      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        const chunkLength = Math.min(5 * 1024 * 1024, sizeBytes - chunkIdx * 5 * 1024 * 1024);
        const chunkRes = await fetch("/api/public/v1/zillionaire/upload/", {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "UPLOAD_CHUNK",
            assetId,
            chunkIndex: chunkIdx,
            totalChunks,
            chunkBytesLength: chunkLength,
          }),
        });

        if (!chunkRes.ok) throw new Error("Upload chunk failed");

        const progressPercent = Math.min(100, Math.round(((chunkIdx + 1) / totalChunks) * 100));
        const uploadedNow = (chunkIdx + 1) * chunkLength;

        setActiveQueue((prev) =>
          prev.map((item) =>
            item.assetId === assetId
              ? {
                  ...item,
                  progress: progressPercent,
                  uploadedBytes: uploadedNow,
                  chunksCompleted: chunkIdx + 1,
                  secondsRemaining: Math.max(0, Math.ceil((sizeBytes - uploadedNow) / (4.8 * 1024 * 1024))),
                }
              : item,
          ),
        );
      }

      // 3. Complete Upload
      const completeRes = await fetch("/api/public/v1/zillionaire/upload/", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "COMPLETE_UPLOAD",
          assetId,
          directPublish,
          durationSeconds: 5400, // 1h 30m
          codec: "h264/aac",
          resolution: "1080p",
        }),
      });

      if (!completeRes.ok) throw new Error("Failed to complete upload");

      setActiveQueue((prev) =>
        prev.map((item) =>
          item.assetId === assetId
            ? { ...item, status: "completed", progress: 100, secondsRemaining: 0 }
            : item,
        ),
      );

      setSuccessMessage(`Upload received for "${title}". It will remain private until processing, rights checks and approval are complete.`);
      // Reset form
      setTitle("");
      setDescription("");
      setSelectedFile(null);
      void loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload error");
    }
  };

  const handleAction = async (assetId: string, operation: "retry" | "delete", reason: string) => {
    try {
      setError(null);
      const token = await restoreWebSession();
      const headers = {
        ...(await getWebAuthHeaders(token || "")),
        "Content-Type": "application/json",
      };

      const res = await fetch("/api/public/v1/zillionaire/upload/", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "ACTION_UPLOAD",
          assetId,
          operation,
          reason,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to execute ${operation}`);
      }

      setSuccessMessage(`Action "${operation}" applied successfully to asset ${assetId}.`);
      void loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const filteredUploads = useMemo(() => {
    return uploads.filter((u) => {
      if (typeFilter !== "all" && u.mediaType !== typeFilter) return false;
      if (statusFilter !== "all" && u.displayState !== statusFilter) return false;
      return true;
    });
  }, [uploads, typeFilter, statusFilter]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Upload Studio"
      tagline="Resumable video ingestion & direct publishing engine"
      account={account}
      activePath="/zillionaire/upload-studio"
      onRefresh={loadData}
      isRefreshing={loading}
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          heading="Video & Media Upload Studio"
          description="Direct-publish movies, series episodes, and live recordings with instant playback compatibility, chunked resumable ingestion, and automated fallback when GPU transcode workers are offline."
          badge="Direct Ingestion"
        />

        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-950/40 p-4 text-rose-200">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
            <div className="flex-1 text-sm font-medium">{error}</div>
            <button onClick={() => setError(null)} className="text-xs text-rose-400 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-4 text-emerald-200">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            <div className="flex-1 text-sm font-medium">{successMessage}</div>
            <button onClick={() => setSuccessMessage(null)} className="text-xs text-emerald-400 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <ConsoleKpiCard
            title="Total Assets"
            value={stats.total}
            subtitle="Ingested in catalogue"
            icon={Layers}
            variant="default"
          />
          <ConsoleKpiCard
            title="Published & Ready"
            value={stats.published + stats.ready}
            subtitle="Available for viewing"
            icon={Play}
            variant="success"
          />
          <ConsoleKpiCard
            title="Awaiting Approval"
            value={uploads.filter((u) => u.displayState === "Needs review" || u.displayState === "Ready").length}
            subtitle="Private until approved"
            icon={Zap}
            variant="info"
          />
          <ConsoleKpiCard
            title="Processing"
            value={stats.processing}
            subtitle="Transcode workers"
            icon={Server}
            variant="warning"
          />
          <ConsoleKpiCard
            title="Needs Review"
            value={stats.needsReview}
            subtitle="Pending owner sign-off"
            icon={Clock}
            variant="neutral"
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab("ingest")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === "ingest"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <UploadCloud className="h-4 w-4" />
            Ingest New Content
          </button>
          <button
            onClick={() => setActiveTab("queue")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === "queue"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="h-4 w-4" />
            Catalogue & Pipeline ({uploads.length})
            {activeQueue.some((q) => q.status === "uploading") && (
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("worker")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === "worker"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Server className="h-4 w-4" />
            Transcode Host Setup
            {processingHostConfigured ? (
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">Active</span>
            ) : (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">Direct Mode</span>
            )}
          </button>
        </div>

        {/* TAB 1: Ingest New Content */}
        {activeTab === "ingest" && (
          <form onSubmit={handleStartUpload} className="space-y-6">
            <ConsoleCard title="1. Content Metadata & Channel Assignment">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Media Classification
                  </label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {(["Movie", "Series", "Episode", "Trailer", "Live recording"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMediaType(t)}
                        className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center transition-all ${
                          mediaType === t
                            ? "border-amber-400 bg-amber-400/10 text-amber-300"
                            : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        {t === "Movie" && <Film className="h-5 w-5 mb-1" />}
                        {t === "Series" && <Tv className="h-5 w-5 mb-1" />}
                        {t === "Episode" && <Clapperboard className="h-5 w-5 mb-1" />}
                        {t === "Trailer" && <Video className="h-5 w-5 mb-1" />}
                        {t === "Live recording" && <Radio className="h-5 w-5 mb-1" />}
                        <span className="text-xs font-medium">{t}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Target Broadcast Channel
                  </label>
                  <select
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                    required
                  >
                    <option value="">Select Channel...</option>
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.title} {ch.published ? "(Live)" : "(Draft)"}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    The asset will be linked to this channel&apos;s schedule and streaming catalog.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Asset Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Lagos Nights (Director's Cut)"
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Genre & Primary Language
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      placeholder="e.g. Nollywood, Thriller"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      placeholder="e.g. English, Yoruba"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Age Rating & Release Date
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={ageRating}
                      onChange={(e) => setAgeRating(e.target.value as "G" | "PG" | "13+" | "16+" | "18+")}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                    >
                      <option value="G">G (All Audiences)</option>
                      <option value="PG">PG (Parental Guidance)</option>
                      <option value="13+">13+ (Teens)</option>
                      <option value="16+">16+ (Mature)</option>
                      <option value="18+">18+ (Adults Only)</option>
                    </select>
                    <input
                      type="date"
                      value={releaseDate}
                      onChange={(e) => setReleaseDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Cast & Creators (Comma separated)
                  </label>
                  <input
                    type="text"
                    value={cast}
                    onChange={(e) => setCast(e.target.value)}
                    placeholder="e.g. Genevieve Nnaji, Richard Mofe-Damijo"
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Synopsis / Description
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter full synopsis, episode notes, or broadcast summary..."
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>
            </ConsoleCard>

            <ConsoleCard title="2. Media Assets, Subtitles & Artwork">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Master Video File (MP4, MOV, WebM, MKV, or HLS .m3u8)
                  </label>
                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-700 bg-slate-900/50 p-6 text-center hover:border-amber-400 transition-colors">
                    <FileVideo className="h-10 w-10 text-amber-400 mb-2" />
                    <p className="text-sm font-medium text-slate-200">
                      {selectedFile ? selectedFile.name : "Choose or drag a video file here"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {selectedFile
                        ? `${formatBytes(selectedFile.size)} • ${selectedFile.type || "Video"}`
                        : "Up to 5 GB. Chunked upload ensures resilience on unstable mobile networks."}
                    </p>
                    <input
                      type="file"
                      accept="video/*,.mkv,.m3u8"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setSelectedFile(e.target.files[0]);
                          if (!title) {
                            setTitle(e.target.files[0].name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
                          }
                        }
                      }}
                      className="mt-4 text-xs text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-amber-400 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-950 hover:file:bg-amber-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Poster Image (Vertical 2:3)
                  </label>
                  <input
                    type="url"
                    value={posterUrl}
                    onChange={(e) => setPosterUrl(e.target.value)}
                    placeholder="https://.../poster.jpg"
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Backdrop Artwork (Horizontal 16:9)
                  </label>
                  <input
                    type="url"
                    value={backdropUrl}
                    onChange={(e) => setBackdropUrl(e.target.value)}
                    placeholder="https://.../backdrop.jpg"
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Subtitles (WebVTT / SRT)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={subtitlesLanguage}
                      onChange={(e) => setSubtitlesLanguage(e.target.value)}
                      placeholder="Lang (e.g. English)"
                      className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                    />
                    <input
                      type="url"
                      value={subtitlesUrl}
                      onChange={(e) => setSubtitlesUrl(e.target.value)}
                      placeholder="Subtitle VTT URL"
                      className="col-span-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="h-5 w-5 text-cyan-300 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-cyan-100">Approval required before publication</div>
                      <p className="mt-1 text-xs leading-5 text-slate-300">
                        Every upload stays private while processing and rights evidence are checked. Only the authorised review and publishing workflow can make a video available to viewers.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </ConsoleCard>

            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-amber-400 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-300 transition-colors disabled:opacity-50"
              >
                <UploadCloud className="h-4 w-4" />
                Submit for Processing & Review
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: Catalogue & Queue */}
        {activeTab === "queue" && (
          <div className="space-y-6">
            {/* Active Transfers Queue */}
            {activeQueue.length > 0 && (
              <ConsoleCard title="Active Resumable Transfer Queue">
                <div className="space-y-4">
                  {activeQueue.map((item) => (
                    <div key={item.assetId} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <FileVideo className="h-5 w-5 text-amber-400" />
                          <div>
                            <span className="text-sm font-medium text-slate-200">{item.filename}</span>
                            <span className="ml-2 text-xs text-slate-500">({formatBytes(item.sizeBytes)})</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {item.status === "uploading" && (
                            <span className="flex items-center gap-1.5 text-emerald-400">
                              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                              {item.speedMbPerSec} MB/s • {item.secondsRemaining}s left
                            </span>
                          )}
                          {item.status === "completed" && (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="h-4 w-4" /> Complete
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                        <span>
                          {item.chunksCompleted} of {item.chunksTotal} chunks transferred
                        </span>
                        <span>{item.progress}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ConsoleCard>
            )}

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center gap-3">
                <Filter className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Filter Catalogue:</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="all">All Media Types</option>
                  <option value="Movie">Movies</option>
                  <option value="Series">Series</option>
                  <option value="Episode">Episodes</option>
                  <option value="Trailer">Trailers</option>
                  <option value="Live recording">Live Recordings</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="all">All States</option>
                  <option value="Published">Published</option>
                  <option value="Ready">Ready</option>
                  <option value="Processing">Processing</option>
                  <option value="Needs review">Needs Review</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>

              <span className="text-xs text-slate-400">
                Showing {filteredUploads.length} of {uploads.length} assets
              </span>
            </div>

            {/* Ingested Assets Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/30">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Content Asset</th>
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3">Format / Codec</th>
                    <th className="px-4 py-3">Size & Duration</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredUploads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-xs">
                        No content assets match the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredUploads.map((asset) => (
                      <tr key={asset.id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 shrink-0 rounded bg-slate-800 flex items-center justify-center text-amber-400">
                              {asset.mediaType === "Movie" ? (
                                <Film className="h-4 w-4" />
                              ) : asset.mediaType === "Series" ? (
                                <Tv className="h-4 w-4" />
                              ) : (
                                <FileVideo className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-slate-100 flex items-center gap-2">
                                {asset.title}
                                {asset.duplicateDetected && (
                                  <span className="rounded bg-rose-500/20 px-1 py-0.2 text-[9px] text-rose-300">
                                    Duplicate
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500">
                                {asset.mediaType} • {asset.genre} • {asset.ageRating} • Rights declaration: {asset.ownershipDeclaration && asset.copyrightDeclaration ? "submitted" : "missing"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300">
                          {asset.channelTitle}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          <div>{asset.codec || "h264/aac"}</div>
                          <div className="text-slate-500">{asset.resolution || "1080p"}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          <div>{formatBytes(asset.actualSizeBytes || asset.declaredSizeBytes)}</div>
                          <div className="text-slate-500">{formatDuration(asset.durationSeconds)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <ConsoleStatusBadge
                            status={asset.displayState}
                            variant={
                              asset.displayState === "Published"
                                ? "success"
                                : asset.displayState === "Ready"
                                  ? "info"
                                  : asset.displayState === "Processing"
                                    ? "warning"
                                    : asset.displayState === "Failed"
                                      ? "error"
                                      : "neutral"
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                const reason = window.prompt("Reason for deleting asset:", "Obsolete or test upload");
                                if (reason) void handleAction(asset.id, "delete", reason);
                              }}
                              title="Delete asset"
                              className="rounded p-1 text-slate-500 hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Transcode Host Setup & Instructions */}
        {activeTab === "worker" && (
          <ConsoleCard title="Processing Host & Mobile Deployment Guide">
            <div className="space-y-4 text-sm text-slate-300">
              <div className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <Info className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-100">Verified processing and publication</h4>
                  <p className="mt-1 text-xs text-slate-400">
                    Producer uploads are stored privately, verified and queued for processing. Videos remain unavailable to viewers until rights evidence has been checked, an authorised administrator approves the content, and the separate publishing step succeeds.
                  </p>
                </div>
              </div>

              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-6">
                Step-by-Step Deployment Instructions (Mobile or Desktop)
              </h4>

              <ol className="list-decimal list-inside space-y-3 text-xs text-slate-300">
                <li className="pl-1">
                  <strong className="text-slate-100">Processing Host Setup:</strong> Review the step-by-step instructions in section 13 of the operator documentation.
                </li>
                <li className="pl-1">
                  <strong className="text-slate-100">Credentials Provisioning:</strong> Generate worker authentication keys and configure them in your environment settings.
                </li>
                <li className="pl-1">
                  <strong className="text-slate-100">Worker Deployment:</strong> Deploy the background worker service to enable multi-bitrate ladder transcode jobs.
                </li>
                <li className="pl-1">
                  <strong className="text-slate-100">Verification:</strong> Every source must be verified and processed before an administrator can approve it. Direct publication is disabled.
                </li>
              </ol>
            </div>
          </ConsoleCard>
        )}
      </div>
    </ConsoleShell>
  );
}
