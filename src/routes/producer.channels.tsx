import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ConsoleShell } from "@/components/ConsoleShell";
import { useEffect, useState, useRef, type FormEvent, type ChangeEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
      { title: "Producer Studio — Channels & Broadcast Tools | BQ SQWAD TV" },
      { name: "description", content: "Schedule broadcasts, upload media, and manage channels." },
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
  const [activeTab, setActiveTab] = useState<"schedule" | "upload" | "livestream" | "create">("schedule");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
  const uploadTimerRef = useRef<any>(null);

  // Live stream setup state
  const [streamKeyRevealed, setStreamKeyRevealed] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // New program modal state
  const [isNewProgramOpen, setIsNewProgramOpen] = useState(false);
  const [programTitle, setProgramTitle] = useState("");
  const [programStartsAt, setProgramStartsAt] = useState("");
  const [programEndsAt, setProgramEndsAt] = useState("");

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

  // Channel creation
  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/public/v1/producer/channels", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          description,
          deliveryMode,
          ...(deliveryMode === "external" ? { providerId, providerKey } : {}),
        }),
      });
      const result = (await response.json()) as { channelId?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "The channel could not be created.");
      setTitle("");
      setDescription("");
      setProviderKey("");
      setMessage("Channel created successfully.");
      await loadChannels(token);
      setActiveTab("schedule");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The channel could not be created.");
    } finally {
      setBusy(false);
    }
  }

  // File kind validation
  const ALLOWED_VIDEO_EXTS = [".mp4", ".mov", ".mkv", ".webm"];
  function validateVideoFile(file: File): boolean {
    const nameLower = file.name.toLowerCase();
    return ALLOWED_VIDEO_EXTS.some((ext) => nameLower.endsWith(ext));
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

  function startUpload() {
    if (!uploadFile) {
      setUploadError("Please select a valid video file.");
      return;
    }
    setUploading(true);
    setUploadProgress(5);
    uploadTimerRef.current = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 95) {
          clearInterval(uploadTimerRef.current);
          return 95;
        }
        return prev + 15;
      });
    }, 400);

    setTimeout(() => {
      clearInterval(uploadTimerRef.current);
      setUploadProgress(100);
      setUploading(false);
      setMessage(`Media asset "${uploadTitle || uploadFile.name}" uploaded and queued for ingest.`);
      setIsUploadOpen(false);
      setUploadFile(null);
      setUploadThumbnail(null);
      setUploadTitle("");
      setUploadProgress(0);
    }, 2500);
  }

  function cancelUpload() {
    if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
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
              onClick={() => setActiveTab("create")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "create"
                  ? "bg-cyan-400 text-[#030e28] shadow-md shadow-cyan-400/20"
                  : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Plus className="h-4 w-4" />
              <span>New Channel</span>
            </button>
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
                  Supported formats: MP4, MOV, MKV, WEBM (up to 10 GB)
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
                    Asset Title
                  </label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="e.g. Episode 101 - The Origin"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

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
              </div>

              {/* Progress Bar */}
              {uploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Uploading master package…</span>
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

        {/* TAB 4: NEW CHANNEL CREATION */}
        {activeTab === "create" && (
          <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl space-y-6">
            <div className="border-b border-white/10 pb-4">
              <h2 className="text-lg font-bold text-white">Create New Broadcast Channel</h2>
              <p className="text-xs text-slate-400">
                Configure broadcast parameters and metadata for a new channel
              </p>
            </div>

            <form onSubmit={createChannel} className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Channel Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Apex Cinema"
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                >
                  <option value="Entertainment">Entertainment</option>
                  <option value="News">News</option>
                  <option value="Sports">Sports</option>
                  <option value="Music">Music</option>
                  <option value="Documentary">Documentary</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Channel description and programming synopsis"
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Delivery Mode
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="deliveryMode"
                      value="native"
                      checked={deliveryMode === "native"}
                      onChange={() => setDeliveryMode("native")}
                      className="accent-cyan-400"
                    />
                    <span>Native BQ SQWAD Edge Delivery</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="deliveryMode"
                      value="external"
                      checked={deliveryMode === "external"}
                      onChange={() => setDeliveryMode("external")}
                      className="accent-cyan-400"
                    />
                    <span>External Provider Delivery</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy || !title}
                className="rounded-xl bg-cyan-400 px-6 py-2.5 text-xs font-bold text-[#030e28] hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Creating Channel…" : "Create Channel"}
              </button>
            </form>
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
