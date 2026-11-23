import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ConsoleShell } from "@/components/ConsoleShell";
import { useEffect, useState, useRef, useMemo, type FormEvent, type ChangeEvent } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Film,
  KeyRound,
  List,
  LoaderCircle,
  Plus,
  Radio,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  Tv,
  UploadCloud,
  X,
  AlertTriangle,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";


type ContentAsset = {
  id: string;
  assetId: string;
  title: string;
  contentType: "movie" | "series" | "video";
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber?: number | null;
  episodeTitle?: string;
  description?: string;
  category: string;
  status: string;
  durationSeconds: number;
  commentsOpen: boolean;
  posterUrl?: string | null;
  createdAt?: string | null;
  rightsReviewStatus?: string | null;
  rejectionReasonCode?: string | null;
  rejectionReasonLabel?: string | null;
  rejectionMessage?: string | null;
  appealAllowed?: boolean;
  appealSubmitted?: boolean;
  reviewQueueFlag?: string | null;
  duplicateDetected?: boolean;
};

type GroupedTitle = {
  title: string;
  contentType: "movie" | "series" | "video";
  category: string;
  posterUrl?: string | null;
  episodes: ContentAsset[];
};

type Channel = {
  id: string;
  title: string;
  category: string;
  published: boolean;
  status: string;
  deliveryMode: string;
  providerSetupStatus?: string | null;
};

type ScheduleItem = {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  contentAssetId?: string;
};

export const Route = createFileRoute("/producer/channels")({
  component: ProducerChannelsPage,
  head: () => ({
    meta: [
      { title: "Producer Upload Studio | BQ SQWAD TV" },
      { name: "description", content: "Upload movies, series, and videos to the Producer Upload Studio." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProducerChannelsPage() {
  return (
    <ConsolePageGuard role="producer">
      {({ token, account, onLock }) => (
        <ProducerChannelsInner token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}


const DEFAULT_CHANNEL_ASSETS: ContentAsset[] = [
  {
    id: "asset_sample_1",
    title: "Lagos Nights - Episode 1: The Awakening",
    seriesTitle: "Lagos Nights",
    seasonNumber: 1,
    episodeNumber: 1,
    episodeTitle: "The Awakening",
    contentType: "series",
    category: "Drama",
    durationSeconds: 2700,
    status: "APPROVED",
    commentsOpen: true,
  },
  {
    id: "asset_sample_2",
    title: "Lagos Nights - Episode 2: Midnight Run",
    seriesTitle: "Lagos Nights",
    seasonNumber: 1,
    episodeNumber: 2,
    episodeTitle: "Midnight Run",
    contentType: "series",
    category: "Drama",
    durationSeconds: 2820,
    status: "APPROVED",
    commentsOpen: true,
  },
];

function ProducerChannelsInner({
  token,
  account,
  onLock,
}: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [scheduleView, setScheduleView] = useState<"day" | "week" | "list">("list");
  const [activeTab, setActiveTab] = useState<"content" | "schedule" | "upload" | "livestream">("schedule");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Content Library & Episode Grouping state
  const [channelAssets, setChannelAssets] = useState<ContentAsset[]>(DEFAULT_CHANNEL_ASSETS);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploadContentType, setUploadContentType] = useState<"movie" | "series">("movie");
  const [uploadSeriesTitle, setUploadSeriesTitle] = useState("");
  const [uploadEpisodeNumber, setUploadEpisodeNumber] = useState<number>(1);
  const [uploadEpisodeTitle, setUploadEpisodeTitle] = useState("");
  const [uploadSeasonNumber, setUploadSeasonNumber] = useState<number>(1);
  const [uploadCommentsOpen, setUploadCommentsOpen] = useState(true);
  const [uploadCategory, setUploadCategory] = useState("Entertainment");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadAgeRating, setUploadAgeRating] = useState<"G" | "TV-Y7" | "PG-13" | "16" | "18">("PG-13");
  const [uploadWarnings, setUploadWarnings] = useState("");
  const [uploadLanguage, setUploadLanguage] = useState("English");
  const [uploadGenre, setUploadGenre] = useState("Drama");
  const [uploadLicenseType, setUploadLicenseType] = useState<"owned" | "licensed" | "public_domain">("owned");
  const [uploadCopyrightHolder, setUploadCopyrightHolder] = useState("BQ SQWAD Content Partners");
  const [uploadProductionYear, setUploadProductionYear] = useState(String(new Date().getFullYear()));
  const [uploadEvidenceFile, setUploadEvidenceFile] = useState<File | null>(null);
  // Appeal modal state
  const [appealAsset, setAppealAsset] = useState<ContentAsset | null>(null);
  const [appealExplanation, setAppealExplanation] = useState("");
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealError, setAppealError] = useState("");
  const [appealSuccess, setAppealSuccess] = useState("");
  const [uploadTerritories, setUploadTerritories] = useState("NG, GH, US, GB");
  const [uploadValidFrom, setUploadValidFrom] = useState("2026-01-01");
  const [uploadValidUntil, setUploadValidUntil] = useState("2030-12-31");
  const [uploadPlatforms, setUploadPlatforms] = useState<Array<"android" | "web" | "android_tv">>(["android", "web", "android_tv"]);
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [copyrightConfirmed, setCopyrightConfirmed] = useState(false);

  // Create Channel state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Entertainment");
  const [description, setDescription] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"native" | "external">("native");
  const [providerId, setProviderId] = useState("provider_akamai");
  const [providerKey, setProviderKey] = useState("");

  // Upload modal & state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadThumbnail, setUploadThumbnail] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Live stream setup state
  const [streamKeyRevealed, setStreamKeyRevealed] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // New program modal state
  const [isNewProgramOpen, setIsNewProgramOpen] = useState(false);
  const [programTitle, setProgramTitle] = useState("");
  const [programStartsAt, setProgramStartsAt] = useState("");
  const [programEndsAt, setProgramEndsAt] = useState("");

  async function loadChannelAssets(channelId: string, idToken: string) {
    if (!channelId) return;
    setLoadingAssets(true);
    try {
      const res = await fetch(`/api/public/v1/producer/channels/${channelId}/assets`, {
        headers: await getWebAuthHeaders(idToken),
      });
      if (res.ok) {
        const data = await res.json();
        setChannelAssets(Array.isArray(data.assets) ? data.assets : []);
      }
    } catch {
      // quiet fallback
    } finally {
      setLoadingAssets(false);
    }
  }

  async function loadChannels(idToken: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/public/v1/producer/channels", {
        headers: await getWebAuthHeaders(idToken),
      });
      const result = (await response.json()) as Channel[] | { error?: string };
      if (!response.ok || !Array.isArray(result)) {
        throw new Error(
          !Array.isArray(result)
            ? (result.error ?? "Producer access is unavailable.")
            : "Could not load channels.",
        );
      }
      setChannels(result);
      if (result.length > 0 && !selectedChannelId) {
        setSelectedChannelId(result[0].id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load channels.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSchedule(idToken: string, channelId: string) {
    if (!channelId) return;
    try {
      const response = await fetch(`/api/public/v1/producer/channels/${channelId}/schedule`, {
        headers: await getWebAuthHeaders(idToken),
      });
      if (response.ok) {
        const data = await response.json();
        setScheduleItems(Array.isArray(data.items) ? data.items : []);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadChannels(token);
  }, [token]);

  useEffect(() => {
    if (selectedChannelId) {
      void loadSchedule(token, selectedChannelId);
    }
  }, [token, selectedChannelId]);

  async function handlePreviewAsset(assetId: string) {
    const previewWindow = window.open("about:blank", "_blank");
    try {
      const headers = await getWebAuthHeaders(token);
      const response = await fetch("/api/public/v1/preview/grant", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ targetType: "asset", targetId: assetId }),
      });
      const result = (await response.json()) as { previewPath?: string; error?: string };
      if (!response.ok || !result.previewPath) {
        throw new Error(result.error || "The private preview is not ready yet.");
      }
      if (previewWindow) {
        previewWindow.opener = null;
        previewWindow.location.replace(result.previewPath);
      } else {
        window.location.assign(result.previewPath);
      }
    } catch (caught) {
      previewWindow?.close();
      setError(caught instanceof Error ? caught.message : "Preview error");
    }
  }

  // File kind validation
  const ALLOWED_VIDEO_EXTS = [".mp4", ".mov", ".mkv", ".webm"];

  const groupedTitles = useMemo(() => {
    const map = new Map<string, GroupedTitle>();
    for (const asset of channelAssets) {
      const key = (asset.seriesTitle || asset.title || "Feature Movie").trim();
      if (!map.has(key)) {
        map.set(key, {
          title: key,
          contentType: asset.contentType || (asset.episodeNumber ? "series" : "movie"),
          category: asset.category || "General",
          posterUrl: asset.posterUrl,
          episodes: [],
        });
      }
      const entry = map.get(key)!;
      entry.episodes.push(asset);
      if (asset.contentType === "series" || asset.episodeNumber) {
        entry.contentType = "series";
      }
    }
    for (const group of map.values()) {
      group.episodes.sort((a, b) => (Number(a.episodeNumber) || 0) - (Number(b.episodeNumber) || 0));
    }
    return Array.from(map.values());
  }, [channelAssets]);

    function validateVideoFile(file: File): boolean {
    const nameLower = file.name.toLowerCase();
    return ALLOWED_VIDEO_EXTS.some((ext) => nameLower.endsWith(ext));
  }

  async function submitAppeal(e: React.FormEvent) {
    e.preventDefault();
    if (!appealAsset) return;
    if (appealExplanation.trim().length < 10) {
      setAppealError("Provide an appeal explanation of at least 10 characters.");
      return;
    }
    setAppealSubmitting(true);
    setAppealError("");
    setAppealSuccess("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Authentication required.");
      const res = await fetch(
        `/api/public/v1/producer/content-assets/${encodeURIComponent(appealAsset.assetId || appealAsset.id)}/appeal`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await getWebAuthHeaders(token)),
          },
          body: JSON.stringify({ explanation: appealExplanation.trim() }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Appeal submission failed.");
      setAppealSuccess("Your appeal has been submitted for rights review.");
      setTimeout(() => {
        setAppealAsset(null);
        setAppealExplanation("");
        setAppealSuccess("");
        if (selectedChannelId && token) loadChannelAssets(selectedChannelId, token);
      }, 1500);
    } catch (err) {
      setAppealError(err instanceof Error ? err.message : "Appeal failed.");
    } finally {
      setAppealSubmitting(false);
    }
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    setUploadError("");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!validateVideoFile(file)) {
        setUploadError("Invalid file kind. Only MP4, MOV, MKV, and WEBM video containers are supported.");
        return;
      }
      setUploadFile(file);
      if (!uploadTitle) {
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    setUploadError("");
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!validateVideoFile(file)) {
        setUploadError("Invalid file kind. Only MP4, MOV, MKV, and WEBM video containers are supported.");
        return;
      }
      setUploadFile(file);
      if (!uploadTitle) {
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  }

  async function startUpload() {
    if (!uploadFile || !selectedChannelId) {
      setUploadError("Select a channel and a valid video file.");
      return;
    }
    if (!ownershipConfirmed || !copyrightConfirmed) {
      setUploadError("Confirm that you own or are authorised to distribute this video and that the submission does not knowingly infringe another party's rights.");
      return;
    }
    if (!uploadLanguage.trim() || !uploadGenre.trim() || !uploadCopyrightHolder.trim() || !/^\d{4}$/.test(uploadProductionYear)) {
      setUploadError("Enter the language, genre, copyright holder and four-digit production year.");
      return;
    }

    const territories = uploadTerritories.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
    if (!territories.length || !uploadValidFrom || !uploadValidUntil || !uploadPlatforms.length) {
      setUploadError("Enter the licensed countries, licence dates and permitted platforms.");
      return;
    }
    const validFrom = new Date(uploadValidFrom + "T00:00:00.000Z");
    const validUntil = new Date(uploadValidUntil + "T23:59:59.999Z");
    if (!Number.isFinite(validFrom.getTime()) || !Number.isFinite(validUntil.getTime()) || validUntil <= validFrom) {
      setUploadError("The licence end date must be after its start date.");
      return;
    }
    setUploading(true);
    setUploadProgress(5);
    setUploadError("");
    try {
      const extension = uploadFile.name.toLowerCase().split(".").pop() || "";
      const mimeByExtension: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska", webm: "video/webm" };
      const mimeType = uploadFile.type || mimeByExtension[extension] || "";
      if (!mimeType) throw new Error("The selected video format is not supported.");
      const headers = { ...(await getWebAuthHeaders(token)), "content-type": "application/json" };
      const intentResponse = await fetch("/api/public/v1/storage/intent", { method: "POST", headers, body: JSON.stringify({ channelId: selectedChannelId, filename: uploadFile.name, sizeBytes: uploadFile.size, mimeType, transcodeProfile: "standard" }) });
      const intent = await intentResponse.json();
      if (!intentResponse.ok || !intent.signedUrl || !intent.assetId) throw new Error(intent.error || "Could not prepare secure video upload.");
      setUploadProgress(15);
      const putResponse = await fetch(intent.signedUrl, { method: intent.method || "PUT", headers: { "content-type": mimeType }, body: uploadFile });
      if (!putResponse.ok) throw new Error("The video file could not be transferred to secure storage.");
      setUploadProgress(40);
      let rightsEvidencePath = "self_declared_rights";
      if (uploadEvidenceFile) {
        const evidenceForm = new FormData();
        evidenceForm.append("file", uploadEvidenceFile);
        const evidenceResponse = await fetch(`/api/public/v1/content-assets/${encodeURIComponent(intent.assetId)}/rights-evidence`, {
          method: "POST",
          headers: await getWebAuthHeaders(token),
          body: evidenceForm,
        });
        const evidence = await evidenceResponse.json();
        if (evidence && evidence.rightsEvidencePath) {
          rightsEvidencePath = evidence.rightsEvidencePath;
        }
      }
      setUploadProgress(55);
      const completeResponse = await fetch("/api/public/v1/storage/complete", { method: "POST", headers, body: JSON.stringify({ assetId: intent.assetId }) });
      const completed = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completed.error || "The uploaded video could not be verified.");
      setUploadProgress(90);
      const isSeries = uploadContentType === "series";
      const seriesName = (uploadSeriesTitle || uploadTitle || "").trim();
      const episodeNumber = isSeries ? uploadEpisodeNumber : undefined;
      const titleText = isSeries ? seriesName + " - Episode " + episodeNumber + (uploadEpisodeTitle ? ": " + uploadEpisodeTitle : "") : (uploadTitle || uploadFile.name.replace(/\.[^/.]+$/, "")).trim();
      if (!titleText) throw new Error("A title is required.");
      const metadataResponse = await fetch("/api/public/v1/producer/channels/" + encodeURIComponent(selectedChannelId) + "/assets", {
        method: "POST",
        headers,
        body: JSON.stringify({ assetId: intent.assetId, title: titleText, description: uploadDescription, category: uploadCategory, genre: uploadGenre.trim(), language: uploadLanguage.trim(), contentWarnings: uploadWarnings.split(",").map((item) => item.trim()).filter(Boolean), productionYear: Number(uploadProductionYear), licenseType: uploadLicenseType, copyrightHolderName: uploadCopyrightHolder.trim(), rightsEvidencePath: rightsEvidencePath, contentType: uploadContentType, ageRating: uploadAgeRating, ownershipDeclaration: true, copyrightDeclaration: true, seriesTitle: isSeries ? seriesName : undefined, seasonNumber: uploadSeasonNumber, episodeNumber, episodeTitle: isSeries ? (uploadEpisodeTitle || "Episode " + episodeNumber) : undefined, commentsOpen: uploadCommentsOpen, territoryCodes: territories, platforms: uploadPlatforms, validFrom: validFrom.toISOString(), validUntil: validUntil.toISOString() }),
      });
      const metadata = await metadataResponse.json();
      if (!metadataResponse.ok) throw new Error(metadata.error || "Video stored, but its metadata and rights declaration could not be submitted.");
      setUploadProgress(100);
      await loadChannelAssets(selectedChannelId, token);
      setMessage("Video uploaded and submitted for review. It remains private until rights checks and independent approval are complete.");
      setIsUploadOpen(false);
      setUploadFile(null);
      setUploadThumbnail(null);
      setUploadTitle("");
      setUploadSeriesTitle("");
      setUploadEpisodeTitle("");
      setUploadDescription("");
      setUploadTerritories("");
      setUploadValidFrom("");
      setUploadValidUntil("");
      setUploadPlatforms([]);
      setOwnershipConfirmed(false);
      setCopyrightConfirmed(false);
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : "Video upload failed.");
    } finally {
      setUploading(false);
    }
  }
  function cancelUpload() {
    setUploading(false);
    setUploadProgress(0);
    setUploadFile(null);
    setUploadThumbnail(null);
  }

  // Schedule conflict detection
  function detectConflicts(items: ScheduleItem[]): { hasConflict: boolean; conflicts: string[] } {
    const conflicts: string[] = [];
    const sorted = [...items].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      const curEnd = new Date(cur.endsAt).getTime();
      const nextStart = new Date(next.startsAt).getTime();
      if (curEnd > nextStart) {
        conflicts.push(`"${cur.title}" overlaps with "${next.title}"`);
      }
    }
    return { hasConflict: conflicts.length > 0, conflicts };
  }

  const { hasConflict, conflicts } = detectConflicts(scheduleItems);

  async function addProgram(e: FormEvent) {
    e.preventDefault();
    if (!selectedChannelId || !programTitle || !programStartsAt || !programEndsAt) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/public/v1/producer/channels/${selectedChannelId}/schedule`, {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({
          title: programTitle,
          startsAt: new Date(programStartsAt).toISOString(),
          endsAt: new Date(programEndsAt).toISOString(),
          reason: "Added from producer calendar",
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || err.error || "Failed to add program");
      }
      setIsNewProgramOpen(false);
      setProgramTitle("");
      setProgramStartsAt("");
      setProgramEndsAt("");
      await loadSchedule(token, selectedChannelId);
      setMessage("Program scheduled successfully.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to add program");
    } finally {
      setBusy(false);
    }
  }

  const activeChannel = channels.find((c) => c.id === selectedChannelId) || channels[0];
  const channelSwitcherOptions = channels.map((c) => ({ id: c.id, name: c.title }));

  const streamIngestUrl = "rtmp://ingest.bqsqwad.tv/live";
  const streamKey = `live_${selectedChannelId || "ch_default"}_${account?.email?.split("@")[0] || "producer"}_sec9401`;

  const copyToClipboard = (text: string, isKey = false) => {
    navigator.clipboard.writeText(text);
    if (isKey) {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <ConsoleShell
      consoleType="producer"
      title="Producer Studio"
      tagline="Broadcast Management & Media Ingest"
      account={account}
      activePath="/producer/channels"
      onLock={onLock}
      channelSwitcher={
        channelSwitcherOptions.length > 0
          ? {
              activeChannelId: selectedChannelId || channelSwitcherOptions[0].id,
              channels: channelSwitcherOptions,
              onSelect: (id: string) => setSelectedChannelId(id),
            }
          : undefined
      }
    >
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab("schedule")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "schedule"
                  ? "bg-cyan-400 text-[#030e28] shadow-md shadow-cyan-400/20"
                  : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <CalendarIcon className="h-4 w-4" />
              <span>Schedule Calendar</span>
            </button>
            <button
              onClick={() => {
                setActiveTab("upload");
                setIsUploadOpen(true);
              }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "upload"
                  ? "bg-cyan-400 text-[#030e28] shadow-md shadow-cyan-400/20"
                  : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <UploadCloud className="h-4 w-4" />
              <span>Upload Content</span>
            </button>
            <button
              onClick={() => setActiveTab("livestream")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "livestream"
                  ? "bg-cyan-400 text-[#030e28] shadow-md shadow-cyan-400/20"
                  : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Radio className="h-4 w-4 text-rose-400" />
              <span>Live-Stream Setup</span>
            </button>
            <button
              onClick={() => setActiveTab("content")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "content"
                  ? "bg-cyan-400 text-[#030e28] shadow-md shadow-cyan-400/20"
                  : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Film className="h-4 w-4" />
              <span>Movies & Series Library</span>
            </button>
            <Link
              to="/producer/upload"
              className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-md shadow-cyan-400/20 transition"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Upload Studio</span>
            </Link>
          </div>

          {/* Active Channel Indicator */}
          {activeChannel && (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#07143d] px-3 py-1.5 text-xs">
              <Tv className="h-4 w-4 text-cyan-300" />
              <span className="font-semibold text-white">{activeChannel.title}</span>
              <span className="text-[10px] text-cyan-300 uppercase px-1.5 py-0.5 rounded bg-cyan-400/10 font-mono">
                {activeChannel.status}
              </span>
            </div>
          )}
        </div>

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

        {/* TAB 1: SCHEDULE CALENDAR */}
        {activeTab === "schedule" && (
          <div className="space-y-6">
            {/* Header & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-cyan-400" />
                  Programming Schedule Calendar
                </h2>
                <p className="text-xs text-slate-400">
                  Electronic Programme Guide (EPG) sequencing for {activeChannel?.title || "Active Channel"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* View switcher */}
                <div className="flex items-center rounded-xl border border-white/10 bg-[#030b2a] p-1 text-xs">
                  {(["day", "week", "list"] as const).map((view) => (
                    <button
                      key={view}
                      onClick={() => setScheduleView(view)}
                      className={`rounded-lg px-3 py-1 font-semibold capitalize transition ${
                        scheduleView === view
                          ? "bg-cyan-400 font-bold text-[#030e28] shadow"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {view === "day" ? "Day" : view === "week" ? "Week" : "List"}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setIsNewProgramOpen(true)}
                  className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-lg shadow-cyan-400/20"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Program</span>
                </button>
              </div>
            </div>

            {/* Conflict Warning Banner */}
            {hasConflict && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-300">Schedule Conflicts Detected</p>
                  <p className="text-amber-200/80 mt-0.5">
                    Overlapping airtimes found in the broadcast timeline:
                  </p>
                  <ul className="mt-2 list-disc list-inside space-y-1 font-mono text-[11px]">
                    {conflicts.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Calendar Content by View */}
            <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl">
              {scheduleItems.length === 0 ? (
                <div className="py-12 text-center">
                  <CalendarIcon className="mx-auto h-12 w-12 text-slate-600" />
                  <p className="mt-3 text-sm font-bold text-white">No Programs Scheduled</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Add programs to populate the Electronic Programme Guide for this channel.
                  </p>
                  <button
                    onClick={() => setIsNewProgramOpen(true)}
                    className="mt-4 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28]"
                  >
                    Schedule First Program
                  </button>
                </div>
              ) : scheduleView === "list" ? (
                <div className="divide-y divide-white/5">
                  {scheduleItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-4 py-3.5 hover:bg-white/5 px-3 rounded-xl transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-400/20 text-cyan-300">
                          <Film className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold text-white text-xs">{item.title}</p>
                          <p className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <Clock className="h-3 w-3" />
                            <span>
                              {new Date(item.startsAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              –{" "}
                              {new Date(item.endsAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <span className="text-slate-600">•</span>
                            <span>{new Date(item.startsAt).toLocaleDateString()}</span>
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold text-cyan-300">
                        EPG Synced
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                /* Day / Week Timeline View */
                <div className="space-y-3">
                  <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-white/10">
                    <div className="col-span-3">Time Window</div>
                    <div className="col-span-7">Broadcast Programme</div>
                    <div className="col-span-2 text-right">Status</div>
                  </div>
                  {scheduleItems.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="grid grid-cols-12 gap-2 items-center rounded-xl border border-white/5 bg-[#030b2a] p-3 hover:border-cyan-400/30 transition text-xs"
                    >
                      <div className="col-span-3 font-mono text-cyan-300 text-[11px]">
                        {new Date(item.startsAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        -{" "}
                        {new Date(item.endsAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="col-span-7 font-semibold text-white truncate">
                        {item.title}
                      </div>
                      <div className="col-span-2 text-right">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Active
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CONTENT UPLOAD MODAL / VIEW */}
        {(activeTab === "upload" || isUploadOpen) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#07143d] p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <UploadCloud className="h-5 w-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Upload Media Asset</h3>
                </div>
                <button
                  onClick={() => {
                    setIsUploadOpen(false);
                    if (activeTab === "upload") setActiveTab("schedule");
                    cancelUpload();
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {uploadError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {uploadError}
                </div>
              )}

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
                  isDragging
                    ? "border-cyan-400 bg-cyan-400/10"
                    : "border-white/15 bg-[#030b2a] hover:border-cyan-400/50"
                }`}
              >
                <UploadCloud className="h-10 w-10 text-cyan-400 mb-2" />
                <p className="text-xs font-bold text-white">
                  {uploadFile ? uploadFile.name : "Drag & drop your video master file here"}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Supported formats: MP4, MOV, MKV, WEBM (up to 5 GB)
                </p>
                <label className="mt-4 cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20 transition">
                  Browse Files
                  <input
                    type="file"
                    accept=".mp4,.mov,.mkv,.webm,video/*"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Title & Metadata */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Content Format
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadContentType("movie")}
                      className={`rounded-xl py-2 px-3 text-xs font-bold transition border ${
                        uploadContentType === "movie"
                          ? "border-cyan-400 bg-cyan-400/20 text-cyan-300"
                          : "border-white/10 bg-[#030b2a] text-slate-400 hover:text-white"
                      }`}
                    >
                      Single Movie / Video
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadContentType("series")}
                      className={`rounded-xl py-2 px-3 text-xs font-bold transition border ${
                        uploadContentType === "series"
                          ? "border-cyan-400 bg-cyan-400/20 text-cyan-300"
                          : "border-white/10 bg-[#030b2a] text-slate-400 hover:text-white"
                      }`}
                    >
                      Series / Episodic
                    </button>
                  </div>
                </div>

                {uploadContentType === "series" ? (
                  <div className="space-y-2.5 rounded-2xl border border-white/10 bg-[#030b2a]/60 p-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                        Series Name / Parent Title *
                      </label>
                      <input
                        type="text"
                        value={uploadSeriesTitle}
                        onChange={(e) => setUploadSeriesTitle(e.target.value)}
                        placeholder="e.g. Lagos Nights (all episodes grouped together)"
                        className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                          Episode #
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={uploadEpisodeNumber}
                          onChange={(e) => setUploadEpisodeNumber(Number(e.target.value) || 1)}
                          className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                          Episode Title
                        </label>
                        <input
                          type="text"
                          value={uploadEpisodeTitle}
                          onChange={(e) => setUploadEpisodeTitle(e.target.value)}
                          placeholder="e.g. The Awakening"
                          className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Movie Title *
                    </label>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="e.g. Midnight Horizon"
                      className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                )}

                {/* Custom Thumbnail Picker */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Custom Poster Thumbnail
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer flex items-center gap-2 rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white transition">
                      <Film className="h-4 w-4 text-cyan-300" />
                      <span>{uploadThumbnail ? uploadThumbnail.name : "Select Image (.jpg, .png, .webp)"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && setUploadThumbnail(e.target.files[0])}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Category & Comments */}
                <div className="flex items-center justify-between gap-4 pt-1">
                  <div className="flex-1">
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="Entertainment">Entertainment</option>
                      <option value="Drama">Drama</option>
                      <option value="Action">Action</option>
                      <option value="Comedy">Comedy</option>
                      <option value="Documentary">Documentary</option>
                      <option value="News">News</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={uploadCommentsOpen}
                      onChange={(e) => setUploadCommentsOpen(e.target.checked)}
                      className="rounded accent-cyan-400"
                    />
                    <span>Allow viewer comments</span>
                  </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Age rating
                    <select value={uploadAgeRating} onChange={(e) => setUploadAgeRating(e.target.value as typeof uploadAgeRating)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white">
                      <option value="G">All ages</option>
                      <option value="TV-Y7">7+</option>
                      <option value="PG-13">13+</option>
                      <option value="16">16+</option>
                      <option value="18">18+</option>
                    </select>
                  </label>
                  <label className="text-[11px] font-semibold text-slate-300">
                    Content warnings (comma separated)
                    <input value={uploadWarnings} onChange={(e) => setUploadWarnings(e.target.value)} placeholder="Violence, strong language" className="mt-1 w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-300">
                    Primary language
                    <input value={uploadLanguage} onChange={(e) => setUploadLanguage(e.target.value)} required maxLength={60} className="mt-1 w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-300">
                    Genre
                    <input value={uploadGenre} onChange={(e) => setUploadGenre(e.target.value)} required maxLength={60} className="mt-1 w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-300">
                    Licence type
                    <select value={uploadLicenseType} onChange={(e) => setUploadLicenseType(e.target.value as typeof uploadLicenseType)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white">
                      <option value="owned">Owned</option><option value="licensed">Licensed</option><option value="public_domain">Public domain</option>
                    </select>
                  </label>
                  <label className="text-[11px] font-semibold text-slate-300">
                    Copyright holder
                    <input value={uploadCopyrightHolder} onChange={(e) => setUploadCopyrightHolder(e.target.value)} required maxLength={150} className="mt-1 w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-300">
                    Production year
                    <input type="number" value={uploadProductionYear} onChange={(e) => setUploadProductionYear(e.target.value)} min="1888" max={new Date().getFullYear()} required className="mt-1 w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
                  </label>
                  <label className="col-span-2 text-[11px] font-semibold text-slate-300">
                    Proof of rights (PDF, PNG or JPEG; 10 MB max)
                    <input type="file" accept="application/pdf,image/png,image/jpeg" required onChange={(e) => setUploadEvidenceFile(e.target.files?.[0] || null)} className="mt-1 w-full text-xs text-white file:mr-2 file:rounded-md file:border-0 file:bg-cyan-500/20 file:px-3 file:py-2 file:text-cyan-100" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-300">
                    Licensed countries (ISO codes)
                    <input value={uploadTerritories} onChange={(e) => setUploadTerritories(e.target.value)} placeholder="NG, GH" className="mt-1 w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-300">
                    Licence starts
                    <input type="date" value={uploadValidFrom} onChange={(e) => setUploadValidFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-300">
                    Licence ends
                    <input type="date" value={uploadValidUntil} onChange={(e) => setUploadValidUntil(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
                  </label>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#030b2a]/60 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Permitted platforms</p>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {(["web", "android", "android_tv"] as const).map((platform) => (
                      <label key={platform} className="flex items-center gap-2 text-xs text-slate-300">
                        <input type="checkbox" checked={uploadPlatforms.includes(platform)} onChange={(e) => setUploadPlatforms((current) => e.target.checked ? [...current, platform] : current.filter((value) => value !== platform))} className="accent-cyan-400" />
                        {platform === "android_tv" ? "Android TV" : platform === "android" ? "Android" : "Web"}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Copyright and ownership declaration</p>
                  <label className="flex items-start gap-2 text-xs leading-5 text-slate-300">
                    <input type="checkbox" checked={ownershipConfirmed} onChange={(e) => setOwnershipConfirmed(e.target.checked)} className="mt-1 accent-cyan-400" />
                    I own this content or have written authority to distribute it for the countries, platforms and licence dates entered above.
                  </label>
                  <label className="flex items-start gap-2 text-xs leading-5 text-slate-300">
                    <input type="checkbox" checked={copyrightConfirmed} onChange={(e) => setCopyrightConfirmed(e.target.checked)} className="mt-1 accent-cyan-400" />
                    I confirm that the information is accurate and that I am not knowingly submitting content that infringes another party's copyright or other rights. I understand that a false declaration may result in rejection, removal or account action.
                  </label>
                  <p className="text-[10px] leading-4 text-slate-400">These declarations are recorded for review. They do not replace licence evidence or independent approval, and the video stays private until approved.</p>
                </div>
              </div>
              </div>

              {/* Progress Bar */}
              {uploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Uploading and verifying private video…</span>
                    <span className="font-mono">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                {uploading ? (
                  <button
                    onClick={cancelUpload}
                    className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
                  >
                    Cancel Upload
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setIsUploadOpen(false);
                        if (activeTab === "upload") setActiveTab("schedule");
                      }}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white"
                    >
                      Close
                    </button>
                    <button
                      onClick={startUpload}
                      disabled={!uploadFile}
                      className="rounded-xl bg-cyan-400 px-5 py-2 text-xs font-bold text-[#030e28] hover:brightness-110 disabled:opacity-50"
                    >
                      Start Upload
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: LIVE STREAM SETUP */}
        {activeTab === "livestream" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl space-y-6">
              <div className="border-b border-white/10 pb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Radio className="h-5 w-5 text-rose-400" />
                  Live Stream Broadcast Setup
                </h2>
                <p className="text-xs text-slate-400">
                  Connect your live encoder (OBS Studio, vMix, Wirecast, Hardware Encoder)
                </p>
              </div>

              {/* Status indicator */}
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#030b2a] p-4">
                <div className="h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
                <div>
                  <p className="text-xs font-bold text-white">Stream Status: Ready for Ingest</p>
                  <p className="text-[11px] text-slate-400">
                    Awaiting live RTMP signal from primary encoder.
                  </p>
                </div>
              </div>

              {/* Ingest URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Server URL / RTMP Ingest Endpoint
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={streamIngestUrl}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 font-mono text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={() => copyToClipboard(streamIngestUrl, false)}
                    className="flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-400/20 transition shrink-0"
                  >
                    {copiedUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedUrl ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              {/* Stream Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Stream Key (Keep Secret)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type={streamKeyRevealed ? "text" : "password"}
                    readOnly
                    value={streamKey}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 font-mono text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={() => setStreamKeyRevealed(!streamKeyRevealed)}
                    className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2.5 text-slate-400 hover:text-white"
                  >
                    {streamKeyRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => copyToClipboard(streamKey, true)}
                    className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-bold text-[#030e28] hover:brightness-110 transition shrink-0 shadow-md shadow-cyan-400/20"
                  >
                    {copiedKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedKey ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="rounded-2xl border border-white/5 bg-[#030b2a] p-5 space-y-3 text-xs">
                <p className="font-bold text-white">Recommended OBS Encoder Settings:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                  <li>Video Codec: H.264 / AVC (High Profile)</li>
                  <li>Rate Control: CBR (Constant Bitrate) — 4,500 to 6,000 kbps for 1080p60</li>
                  <li>Keyframe Interval: 2 seconds</li>
                  <li>Audio Codec: AAC at 128 or 160 kbps (48 kHz stereo)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CONTENT LIBRARY (MOVIES & SERIES WITH NESTED EPISODES) */}
        {activeTab === "content" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Film className="h-5 w-5 text-cyan-400" />
                  Media Assets & Series Library
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Upload movies and series. All episodes are organized together under the parent title with zero fragmentation.
                </p>
              </div>
              <button
                onClick={() => {
                  setUploadContentType("series");
                  setIsUploadOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-md shadow-cyan-400/20"
              >
                <Plus className="h-4 w-4" />
                <span>Upload Movie or Episode</span>
              </button>
            </div>

            {groupedTitles.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-[#07143d] p-12 text-center space-y-4">
                <Film className="mx-auto h-12 w-12 text-slate-500" />
                <h3 className="text-base font-bold text-white">No Media Uploaded Yet</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Upload your standalone feature movies or episodic television series. All episodes under a series are grouped and managed in one place.
                </p>
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-bold text-[#030e28] hover:brightness-110"
                >
                  Upload First Title
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {groupedTitles.map((group) => {
                  const isSeries = group.contentType === "series" || group.episodes.length > 1;
                  const nextEpNumber = group.episodes.length + 1;
                  return (
                    <div
                      key={group.title}
                      className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl space-y-4"
                    >
                      {/* Parent Movie / Series Header */}
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-400/20 text-cyan-300">
                            <Film className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-white">{group.title}</h3>
                              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
                                {isSeries ? `Series • ${group.episodes.length} Episodes` : "Feature Film"}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                                {group.category}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                              All {group.episodes.length} episode{group.episodes.length === 1 ? "" : "s"} grouped in one place
                            </p>
                          </div>
                        </div>

                        {/* Quick Add Episode button for this series */}
                        {isSeries && (
                          <button
                            onClick={() => {
                              setUploadContentType("series");
                              setUploadSeriesTitle(group.title);
                              setUploadEpisodeNumber(nextEpNumber);
                              setUploadEpisodeTitle(`Episode ${nextEpNumber}`);
                              setIsUploadOpen(true);
                            }}
                            className="flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3.5 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-400/20 transition"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Add Episode {nextEpNumber}</span>
                          </button>
                        )}
                      </div>

                      {/* Nested Episodes / Media Items List - All in one place */}
                      <div className="space-y-2.5 pl-2 sm:pl-4">
                        {group.episodes.map((ep, idx) => (
                          <div
                            key={ep.id || idx}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-[#030b2a] p-3.5 hover:border-cyan-400/30 transition"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-[11px] font-mono font-bold text-slate-400">
                                {ep.episodeNumber !== null && ep.episodeNumber !== undefined
                                  ? `E${ep.episodeNumber}`
                                  : `#${idx + 1}`}
                              </span>
                              <div>
                                <p className="text-xs font-bold text-white">
                                  {ep.episodeTitle || ep.title}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {Math.round(ep.durationSeconds / 60) || 45} mins • Status:{" "}
                                  <span className="font-semibold text-emerald-400">{ep.status}</span>
                                  {" • Comments: "}
                                  <span className={ep.commentsOpen ? "text-cyan-300" : "text-slate-500"}>
                                    {ep.commentsOpen ? "Enabled" : "Off"}
                                  </span>
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-xs">
                              {ep.status === "rejected" || ep.rightsReviewStatus === "rejected" ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-lg bg-rose-500/15 border border-rose-500/40 px-2.5 py-1 text-[10px] font-bold text-rose-300">
                                    Rejected: {ep.rejectionReasonLabel || ep.rejectionReasonCode || "Rights issue"}
                                  </span>
                                  {ep.appealSubmitted ? (
                                    <span className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[10px] font-bold text-amber-300">
                                      Appeal under review
                                    </span>
                                  ) : ep.appealAllowed !== false ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAppealAsset(ep);
                                        setAppealExplanation("");
                                        setAppealError("");
                                        setAppealSuccess("");
                                      }}
                                      className="rounded-lg bg-rose-500/20 border border-rose-400/40 px-2.5 py-1 text-[10px] font-bold text-rose-200 hover:bg-rose-500/30 transition"
                                    >
                                      Appeal Rejection
                                    </button>
                                  ) : null}
                                </div>
                              ) : ep.status === "ready" ? (
                                <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                                  Verified Master
                                </span>
                              ) : (
                                <span className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 text-[10px] font-bold text-cyan-300">
                                  {ep.status}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handlePreviewAsset(ep.id || ep.assetId)}
                                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-slate-300 hover:text-white transition"
                                title="Private unbilled preview"
                              >
                                <Eye className="h-3 w-3 text-cyan-400" />
                                <span>Preview</span>
                              </button>
                            </div>
                            {(ep.status === "rejected" || ep.rightsReviewStatus === "rejected") && ep.rejectionMessage && (
                              <div className="w-full mt-1 rounded-xl bg-rose-950/40 border border-rose-500/20 p-2.5 text-xs text-rose-200">
                                <span className="font-semibold text-rose-300">Reason: </span>
                                {ep.rejectionMessage}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MODAL: APPEAL REJECTION */}
        {appealAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-3xl border border-rose-500/30 bg-[#07143d] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-bold text-white">Appeal Upload Rejection</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAppealAsset(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-2xl bg-white/5 p-3.5 space-y-1.5 text-xs">
                <p className="font-bold text-white">{appealAsset.episodeTitle || appealAsset.title}</p>
                <p className="text-rose-300">
                  <span className="font-semibold">Rejection reason: </span>
                  {appealAsset.rejectionReasonLabel || appealAsset.rejectionReasonCode || "Policy issue"}
                </p>
                {appealAsset.rejectionMessage && (
                  <p className="text-slate-300">{appealAsset.rejectionMessage}</p>
                )}
                <p className="text-[11px] text-slate-400 italic">
                  Note: In accordance with platform policy, rejected uploads can be appealed once only.
                </p>
              </div>

              {appealError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 font-medium">
                  {appealError}
                </div>
              )}
              {appealSuccess && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 font-medium">
                  {appealSuccess}
                </div>
              )}

              <form onSubmit={submitAppeal} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Appeal Explanation & Additional Rights Evidence *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={appealExplanation}
                    onChange={(e) => setAppealExplanation(e.target.value)}
                    placeholder="Provide details about your rights, licences, or corrections for the review team (minimum 10 characters)..."
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-rose-400 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setAppealAsset(null)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={appealSubmitting || !appealExplanation.trim()}
                    className="rounded-xl bg-rose-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-rose-500/20 hover:bg-rose-600 disabled:opacity-50 transition"
                  >
                    {appealSubmitting ? "Submitting..." : "Submit Appeal (Once Only)"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: ADD PROGRAM MODAL */}
        {isNewProgramOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#07143d] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white">Schedule New Program</h3>
                <button
                  onClick={() => setIsNewProgramOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={addProgram} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Program Title
                  </label>
                  <input
                    type="text"
                    required
                    value={programTitle}
                    onChange={(e) => setProgramTitle(e.target.value)}
                    placeholder="e.g. Primetime Action Block"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Starts At
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={programStartsAt}
                    onChange={(e) => setProgramStartsAt(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Ends At
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={programEndsAt}
                    onChange={(e) => setProgramEndsAt(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewProgramOpen(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !programTitle || !programStartsAt || !programEndsAt}
                    className="rounded-xl bg-cyan-400 px-5 py-2 text-xs font-bold text-[#030e28] hover:brightness-110 disabled:opacity-50"
                  >
                    Save Program
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
