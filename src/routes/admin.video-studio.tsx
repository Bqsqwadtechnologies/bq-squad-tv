import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Film, UploadCloud, ShieldCheck, Clock3, AlertCircle, CheckCircle2 } from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

type Channel = { id: string; title: string; status: string; published: boolean };
type UploadState = { name: string; progress: number; status: string; detail: string };

export const Route = createFileRoute("/admin/video-studio")({
  component: VideoStudio,
  head: () => ({ meta: [{ title: "Video Studio | ZILLIONAIRE" }, { name: "description", content: "Private source-video uploads for BQ SQWAD TV." }] }),
});

const MAX_BYTES = 5 * 1024 * 1024 * 1024;
const CHUNK_BYTES = 6 * 1024 * 1024;

function encodeMetadata(value: string) {
  // Storage upload metadata values are normalized ASCII strings.
  return btoa(value);
}

async function tusUpload(file: File, endpoint: string, signature: string, path: string, onProgress: (value: number) => void) {
  const metadata = [
    "bucketName " + encodeMetadata("bq-sqwad-source-media"),
    "objectName " + encodeMetadata(path),
    "contentType " + encodeMetadata(file.type),
    "cacheControl " + encodeMetadata("3600"),
  ].join(",");
  const created = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(file.size),
      "Upload-Metadata": metadata,
      "x-signature": signature,
    },
  });
  if (!created.ok) throw new Error("Resumable upload could not be started (" + created.status + ").");
  const location = created.headers.get("Location");
  if (!location) throw new Error("Storage did not return a resumable upload location.");
  const uploadUrl = new URL(location, endpoint).toString();
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + CHUNK_BYTES, file.size));
    const response = await fetch(uploadUrl, {
      method: "PATCH",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": String(offset),
        "Content-Type": "application/offset+octet-stream",
        "x-signature": signature,
      },
      body: chunk,
    });
    if (!response.ok) throw new Error("Resumable upload paused at " + Math.round((offset / file.size) * 100) + "% (" + response.status + "). Please retry the upload.");
    const nextOffset = Number(response.headers.get("Upload-Offset"));
    if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset || nextOffset > file.size) throw new Error("Storage returned an invalid upload offset.");
    offset = nextOffset;
    onProgress(Math.round((offset / file.size) * 100));
  }
}

function VideoStudio() {
  const [token, setToken] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
        if (!restored) throw new Error("Sign in to ZILLIONAIRE before opening Video Studio.");
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
        body: JSON.stringify({ channelId, filename: file.name, sizeBytes: file.size, mimeType: file.type }),
      });
      const intent = await intentResponse.json() as { assetId?: string; path?: string; signedUrl?: string; token?: string; uploadMode?: string; resumableEndpoint?: string | null; error?: string };
      if (!intentResponse.ok || !intent.assetId || !intent.path || !intent.token) throw new Error(intent.error ?? "Could not create the private upload.");
      const assetId = intent.assetId;
      const uploadPath = intent.path;
      const uploadToken = intent.token;
      if (file.size > 6 * 1024 * 1024 && intent.uploadMode !== "tus") {
        throw new Error("Resumable upload is not configured for this project. The file has not been uploaded; no partial movie was published.");
      }
      setUpload({ name: file.name, progress: 0, status: "Uploading source", detail: "Sending the video directly to the existing private source-media bucket." });
      if (intent.uploadMode === "tus" && intent.resumableEndpoint) {
        await tusUpload(file, intent.resumableEndpoint, uploadToken, uploadPath, progress => {
          setUpload({ name: file.name, progress, status: "Uploading source", detail: "Resumable upload · " + progress + "% complete." });
        });
      } else {
        const response = await fetch(intent.signedUrl!, { method: "PUT", headers: { "content-type": file.type, "x-upsert": "false" }, body: file });
        if (!response.ok) throw new Error("Private storage rejected the upload (" + response.status + ").");
        setUpload({ name: file.name, progress: 100, status: "Verifying source", detail: "Checking the stored file and its media signature." });
      }
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
          ? "The private source is verified and a durable HLS processing job has been recorded. The FFmpeg worker is not deployed or connected yet, so this asset remains unavailable for playback and publishing."
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
          <a href="/admin/" className="text-sm font-bold text-cyan-200">← ZILLIONAIRE Control Centre</a>
          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-cyan-200">Video Studio</span>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex items-center gap-3 text-cyan-200"><Film size={22} /><span className="text-xs font-bold uppercase tracking-[0.2em]">Content operations</span></div>
        <h1 className="mt-3 text-3xl font-black sm:text-5xl">Video Studio</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-blue-100/60">Upload a source movie from your phone or computer browser into the existing private Lovable storage. Every upload is checked against your platform channel permissions and verified before it enters the processing queue.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-cyan-300/20 bg-[#07143d] p-5"><UploadCloud className="text-cyan-200" /><p className="mt-3 font-bold">1 · Secure upload</p><p className="mt-1 text-xs leading-5 text-blue-100/55">Private source bucket, signed upload authorization and resumable transfer for large files.</p></div>
          <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><Clock3 className="text-cyan-200" /><p className="mt-3 font-bold">2 · Video processing</p><p className="mt-1 text-xs leading-5 text-blue-100/55">HLS conversion worker is not connected yet. Uploads remain pending and cannot be published until processing is verified.</p></div>
          <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><ShieldCheck className="text-cyan-200" /><p className="mt-3 font-bold">3 · Rights & publishing</p><p className="mt-1 text-xs leading-5 text-blue-100/55">Independent rights review, HLS verification and existing publish safeguards remain required.</p></div>
        </div>
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
        <p className="mt-6 text-xs leading-6 text-blue-100/40">Storage destinations remain unchanged: source uploads use the existing private source-media bucket; processed HLS output remains in the existing private streaming-media bucket. No phone-side conversion or storage migration is used.</p>
      </section>
    </main>
  );
}
