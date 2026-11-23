import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Film, Video, Tv, UploadCloud, Play, Search, CheckCircle2, Clock3 } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ConsoleShell, ConsoleWelcomeBanner, ConsoleCard, ConsoleStatusBadge } from "@/components/ConsoleShell";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

type MediaType = "Movie" | "Episode" | "Video";
type UploadRecord = {
  id: string;
  title: string;
  description: string;
  mediaType: string;
  displayState: string;
  rawStatus: string;
  contentStatus: string;
  sourceFilename: string | null;
  masterPlaylistUrl?: string | null;
  failureReason: string | null;
  createdAt: string | null;
};
type Episode = { id: string; episodeNumber: number; title: string; videoAssetId?: string };
type Season = { id: string; seasonNumber: number; title: string; episodes: Episode[] };
type Series = { id: string; title: string; seasons: Season[] };

export const Route = createFileRoute("/zillionaire/upload-studio")({
  component: UploadStudioRoute,
  head: () => ({
    meta: [
      { title: "Upload Studio | BQ SQWAD TV Zillionaire" },
      { name: "description", content: "Upload movies, series episodes and videos to the private BQ SQWAD TV media library." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function UploadStudioRoute() {
  return (
    <ConsolePageGuard
      role="zillionaire"
      requiredModules={["content", "video"]}
      title="Upload Studio"
      description="Upload movies, videos and series episodes directly into the private BQ SQWAD TV media library."
    >
      {({ token, account, onLock }) => (
        <UploadStudioContent token={token} account={account} {...(onLock ? { onLock } : {})} />
      )}
    </ConsolePageGuard>
  );
}

function UploadStudioContent({
  token,
  account,
  onLock,
}: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [mediaType, setMediaType] = useState<MediaType>("Movie");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("General");
  const [language, setLanguage] = useState("English");
  const [ageRating, setAgeRating] = useState("PG-13");
  const [licenseType, setLicenseType] = useState<"owned" | "licensed" | "public_domain">("owned");
  const [copyrightHolderName, setCopyrightHolderName] = useState("");
  const [productionYear, setProductionYear] = useState(String(new Date().getFullYear()));
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [copyrightConfirmed, setCopyrightConfirmed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [seriesId, setSeriesId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("1");
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedSeries = seriesList.find((item) => item.id === seriesId) ?? null;
  const selectedSeason = selectedSeries?.seasons.find((item) => item.id === seasonId) ?? null;

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(token);
      const [uploadResponse, seriesResponse] = await Promise.all([
        fetch("/api/public/v1/zillionaire/upload/", { headers, cache: "no-store" }),
        fetch("/api/public/v1/zillionaire/series/", { headers, cache: "no-store" }),
      ]);
      const uploadData = (await uploadResponse.json()) as { uploads?: UploadRecord[]; error?: string };
      if (!uploadResponse.ok) throw new Error(uploadData.error ?? "Could not load uploaded media.");
      setUploads(uploadData.uploads ?? []);
      if (seriesResponse.ok) {
        const seriesData = (await seriesResponse.json()) as { series?: Series[] };
        const rows = seriesData.series ?? [];
        setSeriesList(rows);
        if (!seriesId && rows[0]) {
          setSeriesId(rows[0].id);
          if (rows[0].seasons?.[0]) setSeasonId(rows[0].seasons[0].id);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the media library.");
    } finally {
      setLoading(false);
    }
  }, [token, seriesId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredUploads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return uploads;
    return uploads.filter((item) =>
      [item.title, item.description, item.mediaType, item.displayState, item.sourceFilename]
        .some((value) => String(value ?? "").toLowerCase().includes(query)),
    );
  }, [uploads, searchQuery]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    if (!file) {
      setError("Choose a video file before uploading.");
      return;
    }
    if (!title.trim()) {
      setError("Enter a title for this content.");
      return;
    }
    if (file.size <= 0 || file.size > 5_000_000_000) {
      setError("The video must be larger than 0 bytes and no larger than 5 GB.");
      return;
    }
    if (!ownershipConfirmed || !copyrightConfirmed) {
      setError("Confirm that you own or are authorised to distribute this content.");
      return;
    }
    if (mediaType === "Episode" && (!selectedSeries || !selectedSeason || !/^\d+$/.test(episodeNumber))) {
      setError("Choose a series, season and valid episode number before uploading.");
      return;
    }
    const year = productionYear.trim() ? Number(productionYear) : undefined;
    if (year !== undefined && (!Number.isInteger(year) || year < 1888 || year > new Date().getFullYear())) {
      setError("Enter a valid production year or leave it blank.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mimeByExtension: Record<string, string> = {
      mp4: "video/mp4",
      mov: "video/quicktime",
      mkv: "video/x-matroska",
      webm: "video/webm",
    };
    // Browser MIME values are inconsistent for MKV/MOV (some Android browsers
    // report application/octet-stream). The allow-listed extension determines the
    // canonical MIME sent to the signed storage upload.
    const mimeType = mimeByExtension[extension] || "";
    if (!mimeType) {
      setError("Use an MP4, MOV, MKV or WebM video file.");
      return;
    }

    setBusy(true);
    try {
      const headers = await getWebAuthHeaders(token);
      setProgressLabel("Preparing a secure private upload…");
      const intentResponse = await fetch("/api/public/v1/storage/intent", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          filename: file.name,
          sizeBytes: file.size,
          mimeType,
          transcodeProfile: "standard",
          mediaType,
          genre,
          language,
          ageRating,
          licenseType,
          copyrightHolderName: copyrightHolderName.trim(),
          ...(year !== undefined ? { productionYear: year } : {}),
          ownershipDeclaration: ownershipConfirmed,
          copyrightDeclaration: copyrightConfirmed,
          ...(mediaType === "Episode" ? {
            seriesId,
            seasonId,
            episodeNumber: Number(episodeNumber),
          } : {}),
        }),
      });
      const intent = (await intentResponse.json()) as {
        assetId?: string;
        signedUrl?: string;
        method?: string;
        error?: string;
      };
      if (!intentResponse.ok || !intent.assetId || !intent.signedUrl) {
        throw new Error(intent.error ?? "The secure upload could not be prepared.");
      }

      setProgressLabel("Uploading your video to private storage…");
      const storedResponse = await fetch(intent.signedUrl, {
        method: intent.method ?? "PUT",
        // The signed upload URL already encodes the no-overwrite policy.
        // Avoid provider-specific x-upsert headers that can fail B2 CORS preflight.
        headers: { "content-type": mimeType },
        body: file,
      });
      if (!storedResponse.ok) {
        throw new Error("Private storage rejected the video upload (" + storedResponse.status + ").");
      }

      setProgressLabel("Verifying the uploaded video and starting processing…");
      const completeResponse = await fetch("/api/public/v1/storage/complete", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ assetId: intent.assetId }),
      });
      const completed = (await completeResponse.json()) as { error?: string; status?: string };
      if (!completeResponse.ok) {
        throw new Error(completed.error ?? "The uploaded video could not be verified.");
      }

      if (mediaType === "Episode" && selectedSeries && selectedSeason) {
        const existingEpisode = selectedSeason.episodes?.find(
          (item) => item.episodeNumber === Number(episodeNumber),
        );
        const actionBody = existingEpisode
          ? {
              action: "UPDATE_EPISODE",
              seriesId,
              seasonId,
              episodeId: existingEpisode.id,
              changes: { title: title.trim(), videoAssetId: intent.assetId, status: "DRAFT" },
              reason: "Attached a newly uploaded episode video",
            }
          : {
              action: "CREATE_EPISODE",
              seriesId,
              seasonId,
              episodeNumber: Number(episodeNumber),
              title: title.trim(),
              videoAssetId: intent.assetId,
              durationMinutes: 0,
              status: "DRAFT",
              reason: "Created an episode from the Upload Studio",
            };
        const episodeResponse = await fetch("/api/public/v1/zillionaire/series/", {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify(actionBody),
        });
        if (!episodeResponse.ok) {
          const episodeError = (await episodeResponse.json()) as { error?: string };
          setNotice("Video uploaded successfully, but the episode link needs attention: " + (episodeError.error ?? "series update failed") + ".");
        }
      }

      setNotice((current) => current || "Upload received. The video will be previewable when processing is complete.");
      setFile(null);
      setTitle("");
      setDescription("");
      setOwnershipConfirmed(false);
      setCopyrightConfirmed(false);
      setProgressLabel("Upload complete · processing pending");
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The video upload failed.");
      setProgressLabel("");
    } finally {
      setBusy(false);
    }
  }

  async function previewUploadedAsset(assetId: string) {
    setError("");
    const previewWindow = window.open("about:blank", "_blank");
    try {
      const headers = await getWebAuthHeaders(token);
      const response = await fetch("/api/public/v1/preview/grant", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ targetType: "asset", targetId: assetId }),
      });
      const data = (await response.json()) as { previewPath?: string; error?: string };
      if (!response.ok || !data.previewPath) {
        throw new Error(data.error ?? "A private preview is not available yet.");
      }
      if (previewWindow) {
        previewWindow.opener = null;
        previewWindow.location.replace(data.previewPath);
      } else {
        window.location.assign(data.previewPath);
      }
    } catch (caught) {
      previewWindow?.close();
      setError(caught instanceof Error ? caught.message : "Could not open the private preview.");
    }
  }

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Upload Studio"
      tagline="A simple, secure place to upload movies, series episodes and videos."
      account={account}
      activePath="/zillionaire/upload-studio"
      onLock={onLock}
      onRefresh={loadData}
      isRefreshing={loading}
      searchPlaceholder="Search dashboard pages and features…"
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Upload movies, series and videos"
          description="Choose what you are uploading, select the video file, preview it, and send it to the private media library. You do not need to select a broadcast channel."
          badgeText="Media Library"
        />

        <ConsoleCard title="New media upload">
          <form onSubmit={handleUpload} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                { value: "Movie", label: "Movie", detail: "A standalone film", icon: Film },
                { value: "Episode", label: "Series episode", detail: "Attach to a season", icon: Tv },
                { value: "Video", label: "Video", detail: "Other video content", icon: Video },
              ] as const).map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMediaType(option.value)}
                    className={`rounded-xl border p-4 text-left transition ${mediaType === option.value ? "border-cyan-400 bg-cyan-400/10" : "border-slate-700 bg-slate-900/50 hover:border-slate-500"}`}
                  >
                    <Icon className="mb-2 h-5 w-5 text-cyan-300" />
                    <span className="block text-sm font-bold text-white">{option.label}</span>
                    <span className="mt-1 block text-xs text-slate-400">{option.detail}</span>
                  </button>
                );
              })}
            </div>

            {mediaType === "Episode" && (
              <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900/40 p-4 sm:grid-cols-3">
                <label className="text-xs font-semibold text-slate-300">
                  Series
                  <select value={seriesId} onChange={(event) => {
                    const nextId = event.target.value;
                    setSeriesId(nextId);
                    const nextSeries = seriesList.find((item) => item.id === nextId);
                    setSeasonId(nextSeries?.seasons?.[0]?.id ?? "");
                  }} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
                    <option value="">Select series</option>
                    {seriesList.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Season
                  <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
                    <option value="">Select season</option>
                    {selectedSeries?.seasons?.map((item) => <option key={item.id} value={item.id}>{item.title || `Season ${item.seasonNumber}`}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Episode number
                  <input type="number" min="1" value={episodeNumber} onChange={(event) => setEpisodeNumber(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
                </label>
                {seriesList.length === 0 && <p className="text-xs text-amber-300 sm:col-span-3">Create a series and season first in <a className="underline" href="/zillionaire/series">Series & seasons</a>.</p>}
                {seriesList.length > 0 && !selectedSeries?.seasons?.length && <p className="text-xs text-amber-300 sm:col-span-3">This series has no seasons yet. Add one in <a className="underline" href="/zillionaire/series">Series & seasons</a>.</p>}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-300 sm:col-span-2">
                Content title
                <input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Enter movie, episode or video title" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white placeholder:text-slate-500" />
              </label>
              <label className="text-xs font-semibold text-slate-300 sm:col-span-2">
                Description (optional)
                <textarea rows={2} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Briefly describe this content" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" />
              </label>
            </div>

            <details className="rounded-xl border border-slate-700 bg-slate-900/30 p-4">
              <summary className="cursor-pointer text-xs font-bold text-cyan-200">Optional details · genre, language, rating and rights information</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-300">
                  Genre
                  <input maxLength={100} value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Drama, comedy, sports…" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" />
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Language
                  <input maxLength={50} value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" />
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Age rating
                  <select value={ageRating} onChange={(event) => setAgeRating(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white">
                    <option value="G">All ages</option><option value="TV-Y7">7+</option><option value="PG-13">13+</option><option value="16">16+</option><option value="18">18+</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Rights type
                  <select value={licenseType} onChange={(event) => setLicenseType(event.target.value as typeof licenseType)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white">
                    <option value="owned">Owned by us</option><option value="licensed">Licensed</option><option value="public_domain">Public domain</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Copyright holder
                  <input maxLength={150} value={copyrightHolderName} onChange={(event) => setCopyrightHolderName(event.target.value)} placeholder="Rights holder name" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" />
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Production year
                  <input type="number" min="1888" max={new Date().getFullYear()} value={productionYear} onChange={(event) => setProductionYear(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" />
                </label>
              </div>
            </details>

            <label className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-300">
              <input type="checkbox" checked={ownershipConfirmed} onChange={(event) => setOwnershipConfirmed(event.target.checked)} className="mt-0.5" />
              <span>I confirm that BQ SQWAD TV or the submitting account owns this content or has permission to distribute it.</span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-300">
              <input type="checkbox" checked={copyrightConfirmed} onChange={(event) => setCopyrightConfirmed(event.target.checked)} className="mt-0.5" />
              <span>I confirm that the upload does not knowingly infringe another party's copyright. Publication remains subject to rights review.</span>
            </label>

            <div className="rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/30 p-5">
              <label className="block text-xs font-bold text-slate-200">
                Video file (MP4, MOV, MKV or WebM · up to 5 GB)
                <input key={file ? file.name : "empty"} type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-3 block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:font-bold file:text-slate-950" />
              </label>
              {file && <p className="mt-3 text-xs text-slate-400">{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p>}
              {previewUrl && <div className="mt-4 overflow-hidden rounded-xl border border-slate-700 bg-black"><video src={previewUrl} controls playsInline className="aspect-video w-full" /></div>}
            </div>

            {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
            {notice && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}
            {progressLabel && <p className="flex items-center gap-2 text-xs text-cyan-200"><Clock3 className="h-4 w-4" />{progressLabel}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <a href="/zillionaire/series" className="text-xs font-semibold text-cyan-300 underline">Manage series and seasons</a>
              <button type="submit" disabled={busy || !file} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-extrabold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
                <UploadCloud className="h-4 w-4" />{busy ? "Uploading…" : "Upload media"}
              </button>
            </div>
          </form>
        </ConsoleCard>

        <ConsoleCard title="Uploaded media">
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search your uploads…" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-400">Loading media library…</p>
          ) : filteredUploads.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No uploads found. Your uploaded movies, series episodes and videos will appear here.</p>
          ) : (
            <div className="divide-y divide-slate-800">
              {filteredUploads.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.mediaType} · {item.sourceFilename || "Video file"} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : "Date unavailable"}</p>
                    {item.failureReason && <p className="mt-1 text-xs text-rose-300">{item.failureReason}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <ConsoleStatusBadge status={item.rawStatus === "failed" ? "failed" : item.rawStatus === "ready" ? "active" : "pending"} label={item.displayState} />
                    {item.rawStatus === "ready" && item.masterPlaylistUrl ? (
                      <button type="button" onClick={() => void previewUploadedAsset(item.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-400/10">
                        <Play className="h-3.5 w-3.5" /> Preview
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Clock3 className="h-3.5 w-3.5" />Preview available when a playable manifest is ready</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Uploads are private until processing, rights review and publication checks are complete.
          </div>
        </ConsoleCard>
      </div>
    </ConsoleShell>
  );
}
