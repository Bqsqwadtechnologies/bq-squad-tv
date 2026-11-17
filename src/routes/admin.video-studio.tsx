import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Film, UploadCloud, ShieldCheck, Clock3, AlertCircle, CheckCircle2 } from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

type Channel = { id: string; title: string; status: string; published: boolean };
type UploadState = { name: string; progress: number; status: string; detail: string };
type VideoJob = {
  assetId: string; status: string; assetStatus: string | null; contentStatus: string | null; stage: string | null; progress: number;
  attempts: number; workerId: string | null; lastHeartbeatAt: string | null;
  lastErrorCode: string | null; profile: string; outputResolutions: number[];
  outputBytes: number | null; modalEstimatedCostUsd: number | null;
  queuePosition: number | null; createdAt: string | null; updatedAt: string | null;
};
type SpendSnapshot = { month: string; estimatedCostUsd: number; outputBytes: number; monthlyLimitUsd: number; override: boolean; pauseNewJobs: boolean };
type WorkerRecord = { workerId: string; disabled: boolean; updatedAt: string | null };

export const Route = createFileRoute("/admin/video-studio")({
  component: VideoStudio,
  head: () => ({ meta: [{ title: "Video Studio | BQ SQWAD TV" }, { name: "description", content: "Private source-video uploads for BQ SQWAD TV." }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
});

const MAX_BYTES = 5_000_000_000;

function VideoStudio() {
  const [token, setToken] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [transcodeProfile, setTranscodeProfile] = useState<"economy" | "standard" | "high">("standard");
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [spend, setSpend] = useState<SpendSnapshot | null>(null);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [monthlyLimit, setMonthlyLimit] = useState("25");
  const [spendOverride, setSpendOverride] = useState(false);
  const [settingsReason, setSettingsReason] = useState("");
  const [workerReason, setWorkerReason] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [savingJob, setSavingJob] = useState("");
  const [savingSpend, setSavingSpend] = useState(false);
  const [savingWorker, setSavingWorker] = useState("");

  async function loadChannels(idToken: string) {
    const response = await fetch("/api/public/v1/admin/channels", { headers: await getWebAuthHeaders(idToken), cache: "no-store" });
    const data = await response.json() as { channels?: Channel[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load platform channels.");
    setChannels(data.channels ?? []);
    if (!channelId && data.channels?.[0]) setChannelId(data.channels[0].id);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const restored = await restoreWebSession();
        if (!restored) throw new Error("Sign in to continue to Video Studio.");
        if (active) {
          setToken(restored);
          await loadChannels(restored);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not verify access.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    let etag = "";
    const refreshJobs = async () => {
      try {
        const response = await fetch("/api/public/v1/admin/video-jobs", {
          headers: { ...(await getWebAuthHeaders(token)), ...(etag ? { "If-None-Match": etag } : {}) },
          cache: "no-store",
        });
        if (response.status === 304 || !active) return;
        if (!response.ok) return;
        etag = response.headers.get("ETag") ?? etag;
        const data = await response.json() as { jobs?: VideoJob[] };
        if (active) setJobs(data.jobs ?? []);
      } catch {
        // Keep the last known job state during a temporary network interruption.
      }
    };
    const refreshWorkers = async () => {
      try {
        const response = await fetch("/api/public/v1/admin/workers", {
          headers: await getWebAuthHeaders(token),
          cache: "no-store",
        });
        if (response.ok && active) {
          const data = await response.json() as { workers?: WorkerRecord[] };
          setWorkers(data.workers ?? []);
        }
      } catch {
        // Worker controls are only visible when the owner endpoint is available.
      }
    };
    const refreshSpend = async () => {
      try {
        const response = await fetch("/api/public/v1/admin/config/modal-spend", {
          headers: await getWebAuthHeaders(token),
          cache: "no-store",
        });
        if (response.ok && active) {
          const snapshot = await response.json() as SpendSnapshot;
          setSpend(snapshot);
          setMonthlyLimit(String(snapshot.monthlyLimitUsd));
          setSpendOverride(snapshot.override);
        }
      } catch {
        // Cost telemetry is supplementary; do not hide job status when it is unavailable.
      }
    };
    void refreshJobs();
    void refreshSpend();
    void refreshWorkers();
    const jobTimer = window.setInterval(() => void refreshJobs(), 5_000);
    const spendTimer = window.setInterval(() => void refreshSpend(), 60_000);
    return () => {
      active = false;
      window.clearInterval(jobTimer);
      window.clearInterval(spendTimer);
    };
  }, [token]);

  async function saveSpendSettings() {
    if (!token || settingsReason.trim().length < 3 || savingSpend) return;
    setSavingSpend(true);
    try {
      const response = await fetch("/api/public/v1/admin/config/modal-spend", {
        method: "PUT",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({
          monthlyLimitUsd: Number(monthlyLimit),
          override: spendOverride,
          reason: settingsReason.trim(),
        }),
      });
      const data = await response.json() as SpendSnapshot & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save the processing spend settings.");
      setSpend(data);
      setSettingsReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the processing spend settings.");
    } finally {
      setSavingSpend(false);
    }
  }

  async function runJobAction(job: VideoJob, action: "retry" | "cancel" | "approve" | "publish") {
    if (!token || reviewReason.trim().length < 3 || savingJob) return;
    setSavingJob(job.assetId);
    try {
      const endpoint = action === "retry" ? "reprocess" : action;
      const response = await fetch("/api/public/v1/admin/content-assets/" + encodeURIComponent(job.assetId) + "/" + endpoint, {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({ reason: reviewReason.trim() }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The video action could not be completed.");
      setReviewReason("");
      const refresh = await fetch("/api/public/v1/admin/video-jobs", { headers: await getWebAuthHeaders(token), cache: "no-store" });
      if (refresh.ok) setJobs((await refresh.json() as { jobs?: VideoJob[] }).jobs ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The video action could not be completed.");
    } finally {
      setSavingJob("");
    }
  }

  async function setWorkerDisabled(workerId: string, disabled: boolean) {
    if (!token || workerReason.trim().length < 3 || savingWorker) return;
    setSavingWorker(workerId);
    try {
      const response = await fetch("/api/public/v1/admin/workers/" + encodeURIComponent(workerId), {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({ disabled, reason: workerReason.trim() }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update the worker.");
      setWorkerReason("");
      const refresh = await fetch("/api/public/v1/admin/workers", { headers: await getWebAuthHeaders(token), cache: "no-store" });
      if (refresh.ok) setWorkers((await refresh.json() as { workers?: WorkerRecord[] }).workers ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the worker.");
    } finally {
      setSavingWorker("");
    }
  }

  async function startUpload() {
    if (!token || !file || !channelId || busy) return;
    setBusy(true);
    setError("");
    setUpload({ name: file.name, progress: 0, status: "Preparing secure upload", detail: "Requesting a short-lived upload authorization." });
    try {
      const headers = await getWebAuthHeaders(token);
      const intentResponse = await fetch("/api/public/v1/storage/intent", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ channelId, filename: file.name, sizeBytes: file.size, mimeType: file.type, transcodeProfile }),
      });
      const intent = await intentResponse.json() as { assetId?: string; path?: string; signedUrl?: string; method?: string; error?: string };
      if (!intentResponse.ok || !intent.assetId || !intent.path || !intent.signedUrl) throw new Error(intent.error ?? "Could not create the private upload.");
      const assetId = intent.assetId;
      setUpload({ name: file.name, progress: 0, status: "Uploading source", detail: "Sending the video directly to its assigned private storage destination." });
      const response = await fetch(intent.signedUrl, {
        method: intent.method ?? "PUT",
        headers: { "content-type": file.type, "x-upsert": "false" },
        body: file,
      });
      if (!response.ok) throw new Error("Private storage rejected the upload (" + response.status + ").");
      setUpload({ name: file.name, progress: 100, status: "Verifying source", detail: "Checking the stored file and its media signature." });
      const complete = await fetch("/api/public/v1/storage/complete", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      const completed = await complete.json() as { status?: string; transcodeJobStatus?: string; processingWorker?: string; error?: string };
      if (!complete.ok) throw new Error(completed.error ?? "The uploaded file could not be verified.");
      setUpload({
        name: file.name,
        progress: 100,
        status: "Source verified · processing job queued",
        detail: completed.transcodeJobStatus === "queued"
          ? "Your private video has been received. Video processing is not running yet, so this title cannot be played or published. It will become available after processing is complete."
          : "The private source is verified. Processing has not been confirmed; this asset remains unavailable for playback and publishing.",
      });
      setFile(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Upload failed.";
      setError(message);
      setUpload(current => current ? { ...current, status: "Needs attention", detail: message } : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030b2a] text-white">
      <header className="border-b border-cyan-300/15 bg-[#050f35]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <a href="/admin/" className="text-sm font-bold text-cyan-200">← Dashboard</a>
          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-cyan-200">Video Studio</span>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex items-center gap-3 text-cyan-200"><Film size={22} /><span className="text-xs font-bold uppercase tracking-[0.2em]">Content operations</span></div>
        <h1 className="mt-3 text-3xl font-black sm:text-5xl">Video Studio</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-blue-100/60">Upload a movie from your phone or computer into an assigned private storage location. Previously stored files remain supported. Each upload is checked against your channel access and verified before video processing begins.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-cyan-300/20 bg-[#07143d] p-5"><UploadCloud className="text-cyan-200" /><p className="mt-3 font-bold">1 · Secure upload</p><p className="mt-1 text-xs leading-5 text-blue-100/55">Private source storage, a short-lived upload authorization and server-side file verification.</p></div>
          <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><Clock3 className="text-cyan-200" /><p className="mt-3 font-bold">2 · Video processing</p><p className="mt-1 text-xs leading-5 text-blue-100/55">The video processing service is ready in the project, but its always-on host has not been deployed. Uploads remain on hold until processing is running and verified.</p></div>
          <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><ShieldCheck className="text-cyan-200" /><p className="mt-3 font-bold">3 · Rights & publishing</p><p className="mt-1 text-xs leading-5 text-blue-100/55">Independent rights review, final video checks and the existing publishing safeguards remain required.</p></div>
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_2fr]">
          <section className="rounded-2xl border border-cyan-300/20 bg-[#07143d] p-5">
            <h2 className="font-black">Monthly processing usage</h2>
            {spend ? <>
              <p className="mt-3 text-2xl font-black">${spend.estimatedCostUsd.toFixed(4)}</p>
              <p className="mt-1 text-xs text-blue-100/55">Estimated compute cost for {spend.month} against a ${spend.monthlyLimitUsd.toFixed(2)} limit.</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-300" style={{ width: Math.min(100, spend.estimatedCostUsd / spend.monthlyLimitUsd * 100) + "%" }} />
              </div>
              <p className="mt-2 text-xs text-blue-100/55">{(spend.outputBytes / (1024 ** 3)).toFixed(2)} GiB of output transferred</p>
              {spend.pauseNewJobs ? <p className="mt-2 text-xs font-bold text-amber-200">New processing is paused at the monthly limit.</p> : null}
              {spend.override ? <p className="mt-2 text-xs font-bold text-amber-200">The monthly limit override is active.</p> : null}
              <div className="mt-4 grid gap-3 border-t border-white/10 pt-4">
                <label className="grid gap-1 text-xs text-blue-100/65">
                  Monthly estimate limit (USD)
                  <input type="number" min="1" max="1000" step="0.01" value={monthlyLimit}
                    onChange={event => setMonthlyLimit(event.target.value)}
                    className="rounded-lg border border-white/15 bg-[#030b2a] px-3 py-2 text-white" />
                </label>
                <label className="flex items-center gap-2 text-xs text-blue-100/65">
                  <input type="checkbox" checked={spendOverride} onChange={event => setSpendOverride(event.target.checked)} />
                  Temporarily override the application spend guard
                </label>
                <input value={settingsReason} onChange={event => setSettingsReason(event.target.value)}
                  placeholder="Reason for changing the limit or override"
                  className="rounded-lg border border-white/15 bg-[#030b2a] px-3 py-2 text-sm text-white" />
                <button type="button" onClick={() => void saveSpendSettings()} disabled={savingSpend || settingsReason.trim().length < 3}
                  className="min-h-11 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-[#03102d] disabled:opacity-50">
                  {savingSpend ? "Saving…" : "Save spend settings"}
                </button>
              </div>
            </> : <p className="mt-3 text-xs text-blue-100/55">Monthly usage is not available for this account.</p>}
          </section>
          <section className="rounded-2xl border border-white/10 bg-[#07143d] p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-black">Processing queue</h2>
              <span className="text-xs text-blue-100/50">Refreshes every 5 seconds</span>
            </div>
            {jobs.length === 0 ? <p className="mt-4 text-sm text-blue-100/55">No video processing jobs have been recorded yet.</p> : (
              <div className="mt-4 grid gap-3">
                {jobs.map(job => <article key={job.assetId} className="rounded-xl border border-white/10 bg-[#030b2a] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold">{job.status.replaceAll("_", " ")}</span>
                    <span className="text-xs text-blue-100/55">{job.profile} · {job.attempts} attempts</span>
                  </div>
                  {job.queuePosition ? <p className="mt-1 text-xs text-blue-100/55">Queue position: {job.queuePosition}</p> : null}
                  {job.stage ? <p className="mt-1 text-xs text-blue-100/55">{job.stage} · {Math.round(job.progress)}%</p> : null}
                  {job.outputResolutions.length ? <p className="mt-1 text-xs text-blue-100/55">Output: {job.outputResolutions.map(height => height + "p").join(", ")}</p> : null}
                  {job.workerId ? <p className="mt-1 text-xs text-blue-100/55">Worker: {job.workerId}</p> : null}
                  {job.lastHeartbeatAt ? <p className="mt-1 text-xs text-blue-100/55">Last heartbeat: {(() => {
                    const age = Math.max(0, Math.floor((Date.now() - Date.parse(job.lastHeartbeatAt!)) / 1000));
                    return age < 60 ? age + " seconds ago" : age < 3600 ? Math.floor(age / 60) + " minutes ago" : Math.floor(age / 3600) + " hours ago";
                  })()}</p> : null}
                  {job.modalEstimatedCostUsd !== null ? <p className="mt-1 text-xs text-blue-100/55">Estimated compute: ${job.modalEstimatedCostUsd.toFixed(4)}</p> : null}
                  {job.lastErrorCode ? <p className="mt-1 text-xs text-amber-200">Needs attention: {({
                    SOURCE_DOWNLOAD_FAILED: "The source video could not be downloaded. Retry the upload.",
                    SOURCE_HASH_MISMATCH: "The source file changed. Review the upload before retrying.",
                    MEDIA_PROCESSING_FAILED: "The video could not be processed. You can retry it.",
                    WORKER_LEASE_LOST: "Processing was interrupted and will be recovered.",
                    WORKER_DISK_SPACE_LOW: "The processing worker needs more temporary space.",
                    HLS_OBJECT_VERIFICATION_FAILED: "Some output files did not pass verification.",
                  } as Record<string, string>)[job.lastErrorCode] ?? "The video needs attention. Review its processing details."}</p> : null}
                  {job.assetStatus === "processed_pending_review" ? <p className="mt-1 text-xs text-cyan-200">Owner review is required before this video can be used.</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.assetStatus === "processed_pending_review" ? <button type="button" onClick={() => void runJobAction(job, "approve")} disabled={savingJob === job.assetId || reviewReason.trim().length < 3} className="min-h-10 rounded-lg bg-cyan-300 px-3 text-xs font-bold text-[#03102d] disabled:opacity-40">Approve</button> : null}
                    {job.assetStatus === "ready" && job.contentStatus !== "published" ? <button type="button" onClick={() => void runJobAction(job, "publish")} disabled={savingJob === job.assetId || reviewReason.trim().length < 3} className="min-h-10 rounded-lg bg-blue-500 px-3 text-xs font-bold text-white disabled:opacity-40">Publish</button> : null}
                    {job.status === "failed" ? <button type="button" onClick={() => void runJobAction(job, "retry")} disabled={savingJob === job.assetId || reviewReason.trim().length < 3} className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold text-white disabled:opacity-40">Retry</button> : null}
                    {["queued", "processing"].includes(job.status) ? <button type="button" onClick={() => void runJobAction(job, "cancel")} disabled={savingJob === job.assetId || reviewReason.trim().length < 3} className="min-h-10 rounded-lg border border-amber-200/30 px-3 text-xs font-bold text-amber-100 disabled:opacity-40">Cancel</button> : null}
                  </div>
                </article>)}
              </div>
            )}
          </section>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#07143d] p-4">
          <label className="grid gap-2 text-xs text-blue-100/65">
            Reason for retry, cancellation, approval or publishing
            <input value={reviewReason} onChange={event => setReviewReason(event.target.value)}
              placeholder="Enter a reason (at least 3 characters)"
              className="rounded-lg border border-white/15 bg-[#030b2a] px-3 py-2 text-sm text-white" />
          </label>
        </div>
        <section className="mt-4 rounded-2xl border border-white/10 bg-[#07143d] p-5">
          <h2 className="font-black">Processing workers</h2>
          <p className="mt-1 text-xs text-blue-100/55">Disable an individual worker if its credential may have been exposed. The change is recorded.</p>
          {workers.length ? <div className="mt-3 grid gap-2">
            {workers.map(worker => <div key={worker.workerId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#030b2a] p-3">
              <span className="text-sm font-semibold">{worker.workerId} · {worker.disabled ? "Disabled" : "Enabled"}</span>
              <button type="button" onClick={() => void setWorkerDisabled(worker.workerId, !worker.disabled)}
                disabled={savingWorker === worker.workerId || workerReason.trim().length < 3}
                className="min-h-11 rounded-lg border border-white/15 px-3 text-xs font-bold text-white disabled:opacity-40">
                {worker.disabled ? "Enable worker" : "Disable worker"}
              </button>
            </div>)}
          </div> : <p className="mt-3 text-xs text-blue-100/55">No individual worker credentials are configured yet.</p>}
          <input value={workerReason} onChange={event => setWorkerReason(event.target.value)}
            placeholder="Reason for worker change"
            className="mt-3 w-full rounded-lg border border-white/15 bg-[#030b2a] px-3 py-2 text-sm text-white" />
        </section>
        <div className="mt-8 rounded-3xl border border-white/10 bg-[#07143d] p-5 sm:p-7">
          <h2 className="text-xl font-black">Upload a movie source</h2>
          {loading ? <p className="mt-5 text-sm text-blue-100/55">Checking your secure session…</p> : null}
          {!loading && token ? (
            <div className="mt-5 grid gap-5">
              <label className="grid gap-2 text-sm text-blue-100/70">Platform channel
                <select value={channelId} onChange={event => setChannelId(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" disabled={busy}>
                  <option value="">Choose a channel</option>
                  {channels.map(channel => <option key={channel.id} value={channel.id}>{channel.title} · {channel.status}</option>)}
                </select>
              </label>
              {channels.length === 0 ? <p className="text-xs text-amber-200">No platform channels are available to this account. Create or authorize a channel first.</p> : null}
              <label className="grid gap-2 text-sm text-blue-100/70">
                Processing quality
                <select
                  value={transcodeProfile}
                  onChange={event => setTranscodeProfile(event.target.value as "economy" | "standard" | "high")}
                  disabled={busy}
                  className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white"
                >
                  <option value="economy">Economy · smaller files</option>
                  <option value="standard">Standard · recommended</option>
                  <option value="high">High · higher picture quality</option>
                </select>
                <span className="text-xs text-blue-100/45">The video is never enlarged beyond its original resolution.</span>
              </label>
              <label className="grid gap-2 text-sm text-blue-100/70">Video file (MP4, MOV, MKV or WebM · maximum 5 GB)
                <input type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm" onChange={event => setFile(event.target.files?.[0] ?? null)} disabled={busy} className="block w-full rounded-xl border border-white/10 bg-[#030b2a] p-3 text-xs text-blue-100 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-300 file:px-3 file:py-2 file:font-bold file:text-[#031039]" />
              </label>
              {file ? <p className="text-xs text-blue-100/55">{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p> : null}
              <button onClick={() => void startUpload()} disabled={!file || !channelId || busy || file.size > MAX_BYTES} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 font-extrabold text-[#031039] disabled:cursor-not-allowed disabled:opacity-40"><UploadCloud size={18} />{busy ? "Uploading…" : "Upload securely"}</button>
              {file && file.size > MAX_BYTES ? <p className="text-xs text-rose-200">This file exceeds the 5 GB upload limit.</p> : null}
            </div>
          ) : null}
          {error ? <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-sm text-rose-200"><AlertCircle size={18} className="shrink-0" />{error}</p> : null}
          {upload ? <div className="mt-6 rounded-2xl border border-cyan-300/20 bg-[#030b2a] p-4">
            <div className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 size={17} className="text-cyan-200" />{upload.status}</div>
            <p className="mt-2 break-all text-xs text-blue-100/55">{upload.name}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: upload.progress + "%" }} /></div>
            <p className="mt-2 text-xs leading-5 text-blue-100/55">{upload.detail}</p>
          </div> : null}
        </div>
        <p className="mt-6 text-xs leading-6 text-blue-100/40">Previously stored private videos remain available. New uploads and streaming-ready files use one assigned storage location per title. Your phone does not need to convert the video.</p>
      </section>
    </main>
  );
}
