import { useEffect, useState, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  UploadCloud,
  Film,
  Tv,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  Info,
  Loader2,
  FileText,
  ShieldCheck,
  Image as ImageIcon,
  Layers,
  Sparkles,
} from "lucide-react";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import { ConsoleShell } from "@/components/ConsoleShell";

export const Route = createFileRoute("/producer/upload")({
  component: ProducerUploadStudioPage,
  head: () => ({
    meta: [
      { title: "Upload Studio | Producer Console | BQ SQWAD TV" },
      { name: "description", content: "Dedicated Producer Upload Studio for movies, series, and video titles." },
    ],
  }),
});

function ProducerUploadStudioPage() {
  return (
    <ConsolePageGuard role="producer">
      {({ token, account, onLock }) => (
        <ProducerUploadInner token={token} account={account} {...(onLock ? { onLock } : {})} />
      )}
    </ConsolePageGuard>
  );
}

type Step = 1 | 2 | 3 | 4;

interface UploadFormData {
  contentType: "movie" | "series" | "video";
  title: string;
  description: string;
  category: string;
  genre: string;
  language: string;
  ageRating: "G" | "PG" | "TV-Y7" | "PG-13" | "16" | "18";
  releaseDate: string;
  productionYear: number;
  cast: string[];
  crew: string[];
  posterUrl: string;
  backdropUrl: string;
  trailerUrl: string;
  subtitlesUrl: string;
  mediaStoragePath: string;
  mediaUploadSessionId: string;
  // Series specific
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number | null;
  episodeTitle: string;
  // Rights & Declaration (Rule N5 step 3)
  ownershipDeclaration: boolean;
  copyrightDeclaration: boolean;
  rightsEvidencePath: string;
  evidenceUploadSessionId: string;
  copyrightHolderName: string;
  licenseType: "owned" | "licensed" | "public_domain";
}

const initialForm: UploadFormData = {
  contentType: "movie",
  title: "",
  description: "",
  category: "Entertainment",
  genre: "General",
  language: "English",
  ageRating: "PG",
  releaseDate: new Date().toISOString().slice(0, 10),
  productionYear: new Date().getFullYear(),
  cast: [],
  crew: [],
  posterUrl: "",
  backdropUrl: "",
  trailerUrl: "",
  subtitlesUrl: "",
  mediaStoragePath: "",
  mediaUploadSessionId: "",
  seriesTitle: "",
  seasonNumber: 1,
  episodeNumber: null,
  episodeTitle: "",
  ownershipDeclaration: false,
  copyrightDeclaration: false,
  rightsEvidencePath: "",
  evidenceUploadSessionId: "",
  copyrightHolderName: "",
  licenseType: "owned",
};

interface SubmittedTitle {
  id: string;
  title: string;
  contentType: string;
  genre: string;
  status: "draft" | "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  seriesTitle: string | null;
  seasonNumber: number;
  episodeNumber: number | null;
  episodeTitle: string | null;
  createdAt: string | null;
}

function ProducerUploadInner({
  token,
  account,
  onLock,
}: {
  token: string;
  account: any;
  onLock?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"upload" | "submissions">("upload");
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<UploadFormData>(initialForm);
  const [submittedList, setSubmittedList] = useState<SubmittedTitle[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [castInput, setCastInput] = useState("");
  const [crewInput, setCrewInput] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedMediaFile, setSelectedMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState("");

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!selectedMediaFile) {
      setMediaPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(selectedMediaFile);
    setMediaPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedMediaFile]);

  // Load existing submissions & active draft on mount
  useEffect(() => {
    loadSubmissions();
    loadDraft();
  }, [token]);

  async function loadSubmissions() {
    setLoadingList(true);
    try {
      const res = await fetch("/api/public/v1/producer/uploads/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSubmittedList(data.titles || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }

  async function loadDraft() {
    try {
      const res = await fetch("/api/public/v1/producer/uploads/draft", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.draft) {
          setForm((prev) => ({
            ...prev,
            ...data.draft,
          }));
          if (data.draft.step && data.draft.step >= 1 && data.draft.step <= 4) {
            setStep(data.draft.step);
          }
          if (data.draft.savedAt) {
            setLastSaved(new Date(data.draft.savedAt).toLocaleTimeString());
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // Trigger autosave whenever form values change
  function updateForm<K extends keyof UploadFormData>(key: K, value: UploadFormData[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      scheduleAutoSave(next, step);
      return next;
    });
  }

  function scheduleAutoSave(currentForm: UploadFormData, currentStep: Step) {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      triggerSaveDraft(currentForm, currentStep);
    }, 1500);
  }

  async function triggerSaveDraft(data = form, currentStep = step) {
    setSavingDraft(true);
    try {
      const res = await fetch("/api/public/v1/producer/uploads/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...data,
          step: currentStep,
        }),
      });
      if (res.ok) {
        setLastSaved(new Date().toLocaleTimeString());
      }
    } catch {
      // ignore
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleDiscardDraft() {
    if (!confirm("Are you sure you want to discard this draft? All typed progress will be cleared.")) {
      return;
    }
    try {
      await fetch("/api/public/v1/producer/uploads/draft", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setForm(initialForm);
      setStep(1);
      setLastSaved(null);
    } catch {
      // ignore
    }
  }

  // Uploads transfer the selected bytes to a short-lived private storage URL, then verify completion server-side.
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, kind: "video" | "evidence") {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxBytes = kind === "video" ? 5_000_000_000 : 25_000_000;
    if (file.size <= 0 || file.size > maxBytes) {
      setSubmitError(kind === "video" ? "Video files must be 5 GB or smaller." : "Rights evidence must be 25 MB or smaller.");
      e.target.value = "";
      return;
    }
    setSubmitError(null);
    if (kind === "video") setSelectedMediaFile(file);
    setUploadingMedia(true);
    setUploadFileName(file.name);
    setUploadProgress(0);
    try {
      const mediaKind = kind === "video" ? "video" : "evidence";
      const sessionRes = await fetch("/api/public/v1/producer/uploads/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: file.name, sizeBytes: file.size, mediaKind, contentType: file.type || undefined }),
      });
      const session = await sessionRes.json();
      if (!sessionRes.ok || typeof session.signedUrl !== "string" || typeof session.uploadSessionId !== "string") {
        throw new Error(session.message || "Secure uploads are temporarily unavailable. Please try again later.");
      }
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(session.method || "PUT", session.signedUrl, true);
        xhr.setRequestHeader("Content-Type", session.contentType || file.type || "application/octet-stream");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 95));
        };
        xhr.onerror = () => reject(new Error("The file could not be transferred. Check your connection and retry."));
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error("The file could not be transferred to secure storage."));
        xhr.send(file);
      });
      const completeRes = await fetch("/api/public/v1/producer/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uploadSessionId: session.uploadSessionId }),
      });
      const complete = await completeRes.json();
      if (!completeRes.ok || !complete.success) throw new Error(complete.message || "We could not verify the uploaded file. Please try again.");
      setUploadProgress(100);
      if (kind === "video") {
        updateForm("mediaStoragePath", complete.storagePath);
        updateForm("mediaUploadSessionId", session.uploadSessionId);
        if (!form.title) {
          const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
          updateForm("title", cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1));
        }
      } else {
        updateForm("rightsEvidencePath", complete.storagePath);
        updateForm("evidenceUploadSessionId", session.uploadSessionId);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      if (kind === "video") {
        updateForm("mediaStoragePath", "");
        updateForm("mediaUploadSessionId", "");
      } else {
        updateForm("rightsEvidencePath", "");
        updateForm("evidenceUploadSessionId", "");
      }
    } finally {
      setUploadingMedia(false);
    }
  }

  function addCast() {
    if (!castInput.trim()) return;
    const next = [...form.cast, castInput.trim()];
    updateForm("cast", next);
    setCastInput("");
  }

  function removeCast(idx: number) {
    const next = form.cast.filter((_, i) => i !== idx);
    updateForm("cast", next);
  }

  function addCrew() {
    if (!crewInput.trim()) return;
    const next = [...form.crew, crewInput.trim()];
    updateForm("crew", next);
    setCrewInput("");
  }

  function removeCrew(idx: number) {
    const next = form.crew.filter((_, i) => i !== idx);
    updateForm("crew", next);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!form.title.trim()) {
        throw new Error("Title is required.");
      }
      if (!form.mediaStoragePath || !form.mediaUploadSessionId) {
        throw new Error("Upload the movie or episode video before submitting.");
      }
      if (!form.ownershipDeclaration || !form.copyrightDeclaration) {
        throw new Error("You must accept both legal rights declarations before submitting.");
      }
      if (!form.rightsEvidencePath || !form.evidenceUploadSessionId) {
        throw new Error("Proof of rights document or evidence path is required.");
      }

      const res = await fetch("/api/public/v1/producer/uploads/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          seriesTitle: form.contentType === "series" ? (form.seriesTitle || form.title) : undefined,
          seasonNumber: Number(form.seasonNumber) || 1,
          episodeNumber: form.episodeNumber ? Number(form.episodeNumber) : undefined,
          productionYear: Number(form.productionYear) || 2026,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || "Failed to submit title for review.");
      }

      setSubmitSuccess(true);
      setForm(initialForm);
      setSelectedMediaFile(null);
      loadSubmissions();
    } catch (err: any) {
      setSubmitError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ConsoleShell
      consoleType="producer"
      title="Upload Studio"
      tagline="Publish your movies, series, and video titles without channels or pricing complexity"
      account={account}
      activePath="/producer/upload"
      onLock={onLock}
      actions={
        <div className="flex items-center gap-2">
          {lastSaved && (
            <span className="hidden sm:inline-flex items-center text-xs text-muted-foreground mr-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mr-1" />
              Autosaved at {lastSaved}
            </span>
          )}
          {savingDraft && (
            <span className="inline-flex items-center text-xs text-muted-foreground animate-pulse mr-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              Saving...
            </span>
          )}
          <Link
            to="/producer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      }
    >
      <div className="max-w-5xl mx-auto space-y-6 pb-20">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => {
              setActiveTab("upload");
              setSubmitSuccess(false);
            }}
            className={`flex items-center gap-2 px-6 py-3 font-medium text-sm border-b-2 transition ${
              activeTab === "upload"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            New Upload
          </button>
          <button
            onClick={() => {
              setActiveTab("submissions");
              loadSubmissions();
            }}
            className={`flex items-center gap-2 px-6 py-3 font-medium text-sm border-b-2 transition ${
              activeTab === "submissions"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Film className="w-4 h-4" />
            My Submissions ({submittedList.length})
          </button>
        </div>

        {activeTab === "submissions" ? (
          /* SUBMISSIONS LIST WITH GROUPED EPISODES & REJECTION REASONS */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Your Uploaded Titles</h2>
                <p className="text-sm text-muted-foreground">
                  Review status, approval state, and feedback for all your movies and series.
                </p>
              </div>
              <button
                onClick={() => setActiveTab("upload")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition"
              >
                <Plus className="w-4 h-4" />
                Upload New Title
              </button>
            </div>

            {loadingList ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : submittedList.length === 0 ? (
              <div className="p-12 text-center rounded-2xl border border-dashed border-border bg-card">
                <Film className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <h3 className="font-semibold text-lg">No titles uploaded yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1 mb-4">
                  Upload your first movie or series episode. Once approved, it will be published to your producer profile and the catalog.
                </p>
                <button
                  onClick={() => setActiveTab("upload")}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
                >
                  <UploadCloud className="w-4 h-4" />
                  Start Uploading
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {submittedList.map((item) => (
                  <div
                    key={item.id}
                    className="p-5 rounded-xl border border-border bg-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base">{item.title}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-secondary uppercase font-mono">
                          {item.contentType}
                        </span>
                        {item.seriesTitle && (
                          <span className="text-xs text-muted-foreground">
                            • {item.seriesTitle} (S{item.seasonNumber}
                            {item.episodeNumber ? `E${item.episodeNumber}` : ""})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.genre} • Submitted {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "recently"}
                      </div>
                      {item.status === "rejected" && item.rejectionReason && (
                        <div className="mt-2 text-xs p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>
                            <strong>Review Feedback:</strong> {item.rejectionReason}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-3">
                      {item.status === "approved" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approved
                        </span>
                      )}
                      {item.status === "pending" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          <Clock className="w-3.5 h-3.5" />
                          Pending Review
                        </span>
                      )}
                      {item.status === "rejected" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                          <XCircle className="w-3.5 h-3.5" />
                          Needs Revision
                        </span>
                      )}
                      {item.status === "draft" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                          Draft
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : submitSuccess ? (
          /* SUCCESS BANNER */
          <div className="p-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Title Submitted for Review!</h2>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm">
              Your title has been successfully queued for rights and quality verification. You can track its status under My Submissions.
            </p>
            <div className="flex items-center justify-center gap-4 pt-4">
              <button
                onClick={() => {
                  setSubmitSuccess(false);
                  setActiveTab("submissions");
                }}
                className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
              >
                View My Submissions
              </button>
              <button
                onClick={() => {
                  setSubmitSuccess(false);
                  setStep(1);
                  setForm(initialForm);
                }}
                className="px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted"
              >
                Upload Another Title
              </button>
            </div>
          </div>
        ) : (
          /* STEPPER & UPLOAD FORM */
          <div className="space-y-6">
            {/* Sticky Stepper Bar (Rule N5 step 1-4) */}
            <div className="sticky top-0 z-20 bg-background/95 backdrop-blur py-3 border-b border-border">
              <div className="grid grid-cols-4 gap-2 text-xs font-medium">
                {[
                  { num: 1, label: "1. Media File", icon: UploadCloud },
                  { num: 2, label: "2. Metadata", icon: Film },
                  { num: 3, label: "3. Rights", icon: ShieldCheck },
                  { num: 4, label: "4. Review", icon: FileCheck },
                ].map(({ num, label, icon: Icon }) => (
                  <button
                    key={num}
                    onClick={() => setStep(num as Step)}
                    className={`flex items-center justify-center sm:justify-start gap-1.5 p-2 rounded-lg border transition ${
                      step === num
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : step > num
                        ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{num}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Error Notification */}
            {submitError && (
              <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <strong>Submission Error:</strong> {submitError}
                </div>
              </div>
            )}

            {/* STEP 1: RESUMABLE UPLOAD */}
            {step === 1 && (
              <div className="space-y-6 p-6 rounded-2xl border border-border bg-card">
                <div>
                  <h3 className="text-lg font-bold">Step 1: Choose Media File</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload your high-definition video master file. Resumable uploads support up to 50 GB per file.
                  </p>
                </div>

                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition bg-background">
                  <UploadCloud className="w-12 h-12 mx-auto text-muted-foreground/60 mb-3" />
                  <div className="font-semibold text-base mb-1">
                    {uploadFileName || "Drag and drop video file, or browse"}
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    MP4, MKV, MOV, ProRes up to 50 GB. 4K, 1080p supported.
                  </p>
                  <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm cursor-pointer hover:opacity-90">
                    <UploadCloud className="w-4 h-4" />
                    Select Video File
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e, "video")}
                    />
                  </label>
                </div>

                {mediaPreviewUrl && (
                  <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">Video preview</span>
                      <span className="text-[11px] text-muted-foreground">Private · visible only in your upload workflow</span>
                    </div>
                    <video
                      src={mediaPreviewUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="aspect-video w-full rounded-lg bg-black"
                    />
                  </div>
                )}

                {uploadingMedia && (
                  <div className="space-y-2 p-4 rounded-xl border border-border bg-muted/40">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>Uploading {uploadFileName}...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {form.mediaStoragePath && (
                  <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-500 text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Video uploaded and secured: {uploadFileName || "media file"}</span>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-border">
                  <button
                    onClick={handleDiscardDraft}
                    className="inline-flex items-center gap-1.5 text-xs text-rose-500 hover:underline"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Discard Draft
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 ml-auto"
                  >
                    Continue to Details
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: METADATA & DETAILS */}
            {step === 2 && (
              <div className="space-y-6 p-6 rounded-2xl border border-border bg-card">
                <div>
                  <h3 className="text-lg font-bold">Step 2: Title Metadata & Media</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Group series episodes under their title or specify movie details. Everything typed is preserved.
                  </p>
                </div>

                {/* Content Type Selector */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Content Type</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { type: "movie", label: "Feature Film / Movie", icon: Film },
                      { type: "series", label: "Series / Show Episode", icon: Tv },
                      { type: "video", label: "Short / Standalone Video", icon: Layers },
                    ].map(({ type, label, icon: Icon }) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => updateForm("contentType", type as any)}
                        className={`p-3 rounded-xl border text-left flex items-center gap-3 transition ${
                          form.contentType === type
                            ? "border-primary bg-primary/10 text-primary font-bold"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        <span className="text-sm">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Series Specific Grouping (Rule N5 & Prompt) */}
                {form.contentType === "series" && (
                  <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-4">
                    <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                      <Tv className="w-4 h-4" />
                      Series Grouping (Episodes will be grouped under this title)
                    </div>
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-3">
                        <label className="text-xs font-medium">Series / Show Name</label>
                        <input
                          type="text"
                          value={form.seriesTitle}
                          onChange={(e) => updateForm("seriesTitle", e.target.value)}
                          placeholder="e.g. Lagos Chronicles"
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Season Number</label>
                        <input
                          type="number"
                          min="1"
                          value={form.seasonNumber}
                          onChange={(e) => updateForm("seasonNumber", parseInt(e.target.value) || 1)}
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Episode Number</label>
                        <input
                          type="number"
                          min="1"
                          value={form.episodeNumber ?? ""}
                          onChange={(e) =>
                            updateForm("episodeNumber", e.target.value ? parseInt(e.target.value) : null)
                          }
                          placeholder="e.g. 1"
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Episode Subtitle / Name</label>
                        <input
                          type="text"
                          value={form.episodeTitle}
                          onChange={(e) => updateForm("episodeTitle", e.target.value)}
                          placeholder="e.g. The Beginning"
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Primary Metadata */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium">Title *</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => updateForm("title", e.target.value)}
                      placeholder="Title of movie or episode"
                      className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-semibold"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium">Synopsis / Description</label>
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(e) => updateForm("description", e.target.value)}
                      placeholder="Detailed synopsis of the story and key themes..."
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium">Genre</label>
                    <input
                      type="text"
                      value={form.genre}
                      onChange={(e) => updateForm("genre", e.target.value)}
                      placeholder="e.g. Drama, Thriller, Action"
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium">Language</label>
                    <input
                      type="text"
                      value={form.language}
                      onChange={(e) => updateForm("language", e.target.value)}
                      placeholder="e.g. English, Yoruba, Swahili"
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium">Age Rating</label>
                    <select
                      value={form.ageRating}
                      onChange={(e) => updateForm("ageRating", e.target.value as any)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    >
                      <option value="G">G - General Audiences</option>
                      <option value="PG">PG - Parental Guidance</option>
                      <option value="TV-Y7">TV-Y7 - Directed to older children</option>
                      <option value="PG-13">PG-13 - Parents Strongly Cautioned</option>
                      <option value="16">16 - Suitable for 16+</option>
                      <option value="18">18 - Adults Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium">Production Year</label>
                    <input
                      type="number"
                      value={form.productionYear}
                      onChange={(e) => updateForm("productionYear", parseInt(e.target.value) || 2026)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </div>
                </div>

                {/* Cast & Crew Tagging */}
                <div className="grid sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Cast Members</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={castInput}
                        onChange={(e) => setCastInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCast())}
                        placeholder="Add actor name..."
                        className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
                      />
                      <button
                        type="button"
                        onClick={addCast}
                        className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs font-medium"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {form.cast.map((actor, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-secondary text-xs"
                        >
                          {actor}
                          <button
                            type="button"
                            onClick={() => removeCast(idx)}
                            className="hover:text-rose-500 ml-1"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">Crew / Key Roles</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={crewInput}
                        onChange={(e) => setCrewInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCrew())}
                        placeholder="e.g. Director: Jane Doe..."
                        className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
                      />
                      <button
                        type="button"
                        onClick={addCrew}
                        className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs font-medium"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {form.crew.map((member, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-secondary text-xs"
                        >
                          {member}
                          <button
                            type="button"
                            onClick={() => removeCrew(idx)}
                            className="hover:text-rose-500 ml-1"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Artwork & External Media Links */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Artwork & Media URLs
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium">Poster Image URL (2:3 aspect ratio)</label>
                      <input
                        type="url"
                        value={form.posterUrl}
                        onChange={(e) => updateForm("posterUrl", e.target.value)}
                        placeholder="https://..."
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Backdrop Image URL (16:9 banner)</label>
                      <input
                        type="url"
                        value={form.backdropUrl}
                        onChange={(e) => updateForm("backdropUrl", e.target.value)}
                        placeholder="https://..."
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Trailer Video URL (optional preview)</label>
                      <input
                        type="url"
                        value={form.trailerUrl}
                        onChange={(e) => updateForm("trailerUrl", e.target.value)}
                        placeholder="https://..."
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Subtitles VTT URL (optional)</label>
                      <input
                        type="url"
                        value={form.subtitlesUrl}
                        onChange={(e) => updateForm("subtitlesUrl", e.target.value)}
                        placeholder="https://..."
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-border">
                  <button
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 ml-auto"
                  >
                    Continue to Rights
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: RIGHTS DECLARATION & EVIDENCE */}
            {step === 3 && (
              <div className="space-y-6 p-6 rounded-2xl border border-border bg-card">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    Step 3: Legal Rights Declaration & Evidence
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Every title on BQ SQWAD TV must have verified distribution rights. Proof of rights is legally required before public streaming.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium">Copyright Holder / Production Entity</label>
                    <input
                      type="text"
                      value={form.copyrightHolderName}
                      onChange={(e) => updateForm("copyrightHolderName", e.target.value)}
                      placeholder="e.g. Blue Quartz Pictures Ltd"
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">License Type</label>
                    <select
                      value={form.licenseType}
                      onChange={(e) => updateForm("licenseType", e.target.value as any)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    >
                      <option value="owned">Sole Proprietary Owner (100% owned)</option>
                      <option value="licensed">Exclusive Commercial License</option>
                      <option value="public_domain">Public Domain / Creative Commons</option>
                    </select>
                  </div>
                </div>

                {/* Proof of rights upload */}
                <div className="border border-border rounded-xl p-5 bg-background space-y-3">
                  <label className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    Upload Proof of Rights (Contract, Certificate, or Chain-of-Title PDF)
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Accepts PDF, PNG, JPG up to 20 MB. This document is kept private and used exclusively for compliance verification.
                  </p>
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium cursor-pointer hover:bg-muted">
                    <UploadCloud className="w-4 h-4" />
                    Select Proof Document
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e, "evidence")}
                    />
                  </label>
                  {form.rightsEvidencePath && (
                    <div className="text-xs text-emerald-500 flex items-center gap-1.5 mt-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Evidence attached: {form.rightsEvidencePath.split("/").pop()}
                    </div>
                  )}
                </div>

                {/* Checkbox Declarations */}
                <div className="space-y-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.ownershipDeclaration}
                      onChange={(e) => updateForm("ownershipDeclaration", e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-xs leading-relaxed">
                      I declare and warrant that I am the sole author, copyright holder, or legally authorized licensee with commercial distribution rights for this title on BQ SQWAD TV across supported territories.
                    </span>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.copyrightDeclaration}
                      onChange={(e) => updateForm("copyrightDeclaration", e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-xs leading-relaxed">
                      I confirm this content does not infringe upon any third-party copyrights, trademarks, privacy, or publicity rights, and complies with platform community standards.
                    </span>
                  </label>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-border">
                  <button
                    onClick={() => setStep(2)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={() => setStep(4)}
                    disabled={!form.ownershipDeclaration || !form.copyrightDeclaration}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 ml-auto"
                  >
                    Continue to Review
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: REVIEW & SUBMIT */}
            {step === 4 && (
              <div className="space-y-6 p-6 rounded-2xl border border-border bg-card">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-primary" />
                    Step 4: Final Review & Submission
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Please review your submission details. Once submitted, your title will enter review.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 p-5 rounded-xl border border-border bg-background text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs block">Title</span>
                    <strong className="text-base">{form.title || "(Untitled)"}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs block">Format</span>
                    <span className="uppercase font-mono text-xs">{form.contentType}</span>
                    {form.seriesTitle && (
                      <span className="text-xs text-muted-foreground ml-2">
                        • {form.seriesTitle} (S{form.seasonNumber}
                        {form.episodeNumber ? `E${form.episodeNumber}` : ""})
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs block">Genre & Language</span>
                    <span>
                      {form.genre} • {form.language}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs block">Age Rating & Year</span>
                    <span>
                      {form.ageRating} • {form.productionYear}
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground text-xs block">Synopsis</span>
                    <p className="text-xs mt-1 text-muted-foreground">{form.description || "No synopsis provided."}</p>
                  </div>
                  <div className="sm:col-span-2 flex flex-wrap gap-4 pt-2 border-t border-border">
                    <div>
                      <span className="text-muted-foreground text-xs block">Video Master</span>
                      <span className="text-xs font-mono">{form.mediaStoragePath ? "Attached ✓" : "Pending upload"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">Rights Evidence</span>
                      <span className="text-xs font-mono">{form.rightsEvidencePath ? "Attached ✓" : "Pending upload"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">Legal Declarations</span>
                      <span className="text-xs text-emerald-500 font-semibold">Accepted ✓</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-border">
                  <button
                    onClick={() => setStep(3)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !form.title.trim()}
                    className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-50 ml-auto shadow-md"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting Title...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Submit for Review
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
