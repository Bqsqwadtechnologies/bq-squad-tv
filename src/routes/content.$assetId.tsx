import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatMinorCurrency as money } from "@/lib/format-money";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  Check,
  FastForward,
  Film,
  Globe,
  LoaderCircle,
  MessageSquare,
  PictureInPicture2,
  Play,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Star,
  Subtitles,
  Tv2,
  Volume2,
  Wallet,
  Maximize,
  Cast,
  AlertTriangle,
} from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

type Content = {
  id: string;
  channelId: string;
  title: string;
  description: string;
  category: string;
  posterUrl: string | null;
  averageStars: number;
  ratingCount: number;
  contentRating: string;
  deliveryMode: string;
  currency: string;
  ratePerMinuteMinor: number;
  rightsCurrent: boolean;
};
type Comment = { id: string; body: string; viewerNumber: string; createdAt: string | null };
type PlaybackState = "playing" | "paused" | "buffering" | "idle" | "ended";

export const Route = createFileRoute("/content/$assetId")({
  component: ContentDetailsPage,
  head: () => ({ meta: [{ title: "Content | BQ SQWAD TV" }] }),
});

export function ContentDetailsPage() {
  const { assetId } = Route.useParams();
  const [authToken, setAuthToken] = useState("");
  const [content, setContent] = useState<Content | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [wallet, setWallet] = useState<{ balanceMinor: number; currency: string } | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState("");

  // Batch 5 Player Enhancements
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>("off");
  const [selectedAudio, setSelectedAudio] = useState<string>("original");
  const [selectedQuality, setSelectedQuality] = useState<string>("auto");
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [savedResumeTime, setSavedResumeTime] = useState<number>(0);
  const [hasPromptedResume, setHasPromptedResume] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reporterName, setReporterName] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [rightsHolderName, setRightsHolderName] = useState("");
  const [rightsHolderEmail, setRightsHolderEmail] = useState("");
  const [rightsBasis, setRightsBasis] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportDeclaration, setReportDeclaration] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [nextEpisodeAvailable, setNextEpisodeAvailable] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef("");
  const sequenceRef = useRef(0);
  const playbackStateRef = useRef<PlaybackState>("idle");

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(path, {
      ...init,
      headers: { ...(await getWebAuthHeaders(authToken)), ...(init.headers ?? {}) },
      cache: "no-store",
    });
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok)
      throw new Error(
        typeof result["error"] === "string"
          ? result["error"]
          : "The request could not be completed.",
      );
    return result;
  }

  async function loadContent(idAuthToken: string) {
    const headers = await getWebAuthHeaders(idAuthToken);
    const [contentResponse, commentsResponse] = await Promise.all([
      fetch("/api/public/v1/content-assets/" + encodeURIComponent(assetId), {
        headers,
        cache: "no-store",
      }),
      fetch("/api/public/v1/content-assets/" + encodeURIComponent(assetId) + "/comments", {
        headers,
        cache: "no-store",
      }),
    ]);
    const contentResult = (await contentResponse.json()) as { content?: Content; error?: string };
    const commentsResult = (await commentsResponse.json()) as Comment[] | { error?: string };
    if (!contentResponse.ok || !contentResult.content)
      throw new Error(contentResult.error ?? "This content is not available.");
    if (!commentsResponse.ok || !Array.isArray(commentsResult))
      throw new Error(
        !Array.isArray(commentsResult)
          ? (commentsResult.error ?? "Comments are unavailable.")
          : "Comments are unavailable.",
      );
    setContent(contentResult.content);
    setComments(commentsResult);
  }

  useEffect(() => {
    try {
      const savedWatchlist = localStorage.getItem("bq_viewer_library");
      if (savedWatchlist) {
        const list = JSON.parse(savedWatchlist);
        if (Array.isArray(list)) {
          setInWatchlist(list.some((item: { id: string }) => item.id === assetId));
        }
      }
    } catch {
      // Ignore storage error
    }
  }, [assetId]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`bq_resume_${assetId}`);
      if (stored) {
        const seconds = parseFloat(stored);
        if (!isNaN(seconds) && seconds > 5) {
          setSavedResumeTime(seconds);
        }
      }
    } catch {
      // Ignore storage error
    }
  }, [assetId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const idAuthToken = await restoreWebSession();
        if (!idAuthToken) throw new Error("Sign in to view content details.");
        if (active) setAuthToken(idAuthToken);
        const headers = await getWebAuthHeaders(idAuthToken);
        const [contentResponse, commentsResponse] = await Promise.all([
          fetch("/api/public/v1/content-assets/" + encodeURIComponent(assetId), {
            headers,
            cache: "no-store",
          }),
          fetch("/api/public/v1/content-assets/" + encodeURIComponent(assetId) + "/comments", {
            headers,
            cache: "no-store",
          }),
        ]);
        const contentResult = (await contentResponse.json()) as {
          content?: Content;
          error?: string;
        };
        const commentsResult = (await commentsResponse.json()) as Comment[] | { error?: string };
        if (!contentResponse.ok || !contentResult.content)
          throw new Error(contentResult.error ?? "This content is not available.");
        if (!commentsResponse.ok || !Array.isArray(commentsResult))
          throw new Error("Comments are unavailable.");
        if (active) {
          setContent(contentResult.content);
          setComments(commentsResult);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load content.");
      }
    })();
    return () => {
      active = false;
    };
  }, [assetId]);

  useEffect(() => {
    if (!sessionId || !authToken) return;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || !sessionRef.current) return;
      const clientSequence = ++sequenceRef.current;
      void api("/api/public/v1/sessions/" + encodeURIComponent(sessionRef.current) + "/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientSequence,
          playbackState: playbackStateRef.current,
          playbackPositionMs: Math.max(0, Math.floor(video.currentTime * 1000)),
        }),
      })
        .then((result) => {
          if (result["active"] === false) {
            setMessage(
              "This playback session has ended. Check your wallet or viewing limit before starting again.",
            );
            setPlaybackUrl("");
            setSessionId("");
            sessionRef.current = "";
          }
        })
        .catch((caught) => {
          setError(caught instanceof Error ? caught.message : "Playback heartbeat failed.");
          setPlaybackUrl("");
          setSessionId("");
          sessionRef.current = "";
        });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [sessionId, authToken]);

  // Viewing meter ticker
  useEffect(() => {
    if (!sessionId) return;
    const ticker = window.setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setElapsedSeconds((prev) => prev + 1);
        const curr = videoRef.current.currentTime;
        setShowSkipIntro(curr > 0 && curr < 90);
        try {
          localStorage.setItem(`bq_resume_${assetId}`, String(Math.floor(curr)));
        } catch {
          // Ignore storage error
        }
      }
    }, 1000);
    return () => window.clearInterval(ticker);
  }, [sessionId, assetId]);

  async function startPlayback(resumeFrom?: number) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/api/public/v1/sessions/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channelId: content?.channelId,
          contentAssetId: assetId,
          clientPlatform: "web",
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const id = String(result["sessionId"] ?? "");
      const url = String(result["playbackUrl"] ?? "");
      if (!id || !url) throw new Error("The server did not return a valid playback session.");
      sessionRef.current = id;
      sequenceRef.current = 0;
      playbackStateRef.current = "idle";
      setSessionId(id);
      setPlaybackUrl(url);
      setElapsedSeconds(0);
      setMessage("Playback session started. Charges are based on verified playback time.");

      if (resumeFrom && resumeFrom > 0) {
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = resumeFrom;
          }
        }, 500);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Playback could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function endPlayback() {
    const id = sessionRef.current;
    if (!id) return;
    setBusy(true);
    try {
      await api("/api/public/v1/sessions/" + encodeURIComponent(id) + "/end", { method: "POST" });
      setMessage("Playback ended and the completed viewing intervals were settled.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not end playback cleanly.");
    } finally {
      sessionRef.current = "";
      setSessionId("");
      setPlaybackUrl("");
      setBusy(false);
    }
  }

  function handleSpeedChange(rate: number) {
    setPlaybackSpeed(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }

  function handleSkipIntro() {
    if (videoRef.current) {
      videoRef.current.currentTime += 85;
      setShowSkipIntro(false);
    }
  }

  async function handleTogglePiP() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {
      // Picture-in-picture not supported or prevented
    }
  }

  function toggleWatchlist() {
    setInWatchlist((prev) => {
      const next = !prev;
      try {
        const raw = localStorage.getItem("bq_viewer_library");
        let list: Array<{
          id: string;
          title: string;
          type: string;
          genre: string;
          posterUrl: string;
          addedAt: string;
        }> = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) list = [];
        if (next && content) {
          if (!list.some((i) => i.id === assetId)) {
            list.unshift({
              id: assetId,
              title: content.title,
              type: content.category.toLowerCase().includes("series") ? "series" : "movie",
              genre: content.category,
              posterUrl: content.posterUrl || "/brand/og-image.png",
              addedAt: new Date().toISOString().split("T")[0],
            });
          }
        } else {
          list = list.filter((i) => i.id !== assetId);
        }
        localStorage.setItem("bq_viewer_library", JSON.stringify(list));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }

  async function handleShare() {
    const shareData = {
      title: content?.title ?? "BQ SQWAD TV",
      text: content?.description ?? "Watch on BQ SQWAD TV",
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // Share dismissed
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      } catch {
        // Clipboard error
      }
    }
  }

  async function submitCopyrightReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportDeclaration) {
      setError("Please confirm that your copyright report is accurate.");
      return;
    }
    setReportBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public/v1/content-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: "content_asset", targetId: assetId, reason: "copyright_infringement", details: reportDetails, reporterName, reporterEmail, rightsHolderName, rightsHolderEmail, rightsBasis, declaration: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The copyright report could not be submitted.");
      setReportOpen(false);
      setReportDetails("");
      setRightsBasis("");
      setReportDeclaration(false);
      setMessage("Copyright report received. The moderation team will review the claim.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The copyright report could not be submitted.");
    } finally {
      setReportBusy(false);
    }
  }
  async function rateContent(value: number) {
    setError("");
    try {
      await api("/api/public/v1/content-assets/" + encodeURIComponent(assetId) + "/rating", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stars: value }),
      });
      setStars(value);
      setMessage("Your rating was saved.");
      await loadContent(authToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rating could not be saved.");
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/public/v1/content-assets/" + encodeURIComponent(assetId) + "/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: comment }),
      });
      setComment("");
      setMessage("Your comment was submitted for moderation and will appear after approval.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Comment could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const calculatedCostMinor = content
    ? Math.floor((content.ratePerMinuteMinor / 60) * elapsedSeconds)
    : 0;

  return (
    <main className="min-h-screen bg-[#030b2a] px-4 py-7 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-cyan-200">
            <ArrowLeft size={16} /> Back to BQ SQWAD TV
          </a>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleWatchlist}
              aria-label={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition"
            >
              <Bookmark size={14} className={inWatchlist ? "fill-cyan-400 text-cyan-400" : ""} />
              <span>{inWatchlist ? "In Watchlist" : "Add to Watchlist"}</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition"
            >
              {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
              <span>{copiedLink ? "Link Copied" : "Share"}</span>
            </button>
            <button
              type="button"
              onClick={() => setReportOpen((open) => !open)}
              className="flex items-center gap-1.5 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-300/10 transition"
            >
              <AlertTriangle size={14} />
              <span>Report copyright</span>
            </button>
          </div>
        </div>

        {reportOpen && (
          <form onSubmit={submitCopyrightReport} className="mt-5 space-y-3 rounded-2xl border border-amber-300/20 bg-[#111b3b] p-4">
            <div>
              <h2 className="text-sm font-bold text-amber-100">Copyright or ownership report</h2>
              <p className="mt-1 text-xs leading-5 text-slate-300">Use this form if you are the rights holder or are authorised to act for them. Include enough information for the team to identify the rights and the video. False or abusive reports may be rejected.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input required value={reporterName} onChange={(e) => setReporterName(e.target.value)} placeholder="Your full name" className="rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
              <input required type="email" value={reporterEmail} onChange={(e) => setReporterEmail(e.target.value)} placeholder="Your contact email" className="rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
              <input required value={rightsHolderName} onChange={(e) => setRightsHolderName(e.target.value)} placeholder="Rights holder name" className="rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
              <input required type="email" value={rightsHolderEmail} onChange={(e) => setRightsHolderEmail(e.target.value)} placeholder="Rights holder contact email" className="rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
            </div>
            <textarea required minLength={10} value={rightsBasis} onChange={(e) => setRightsBasis(e.target.value)} placeholder="Explain the work you own/control and why this video infringes those rights." rows={3} className="w-full rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
            <textarea value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder="Additional details or evidence references (do not include passwords or payment details)." rows={2} className="w-full rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
            <label className="flex items-start gap-2 text-xs leading-5 text-slate-300">
              <input type="checkbox" required checked={reportDeclaration} onChange={(e) => setReportDeclaration(e.target.checked)} className="mt-1 accent-cyan-400" />
              I confirm that I am the rights holder or authorised representative and that the information in this report is accurate to the best of my knowledge.
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReportOpen(false)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Cancel</button>
              <button type="submit" disabled={reportBusy} className="rounded-lg bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{reportBusy ? "Submitting…" : "Submit copyright report"}</button>
            </div>
          </form>
        )}

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/5 p-4 text-sm text-rose-200"
          >
            {error}{" "}
            <a href="/account" className="font-bold underline">
              Sign in or check your account
            </a>
          </p>
        )}

        {content ? (
          <>
            <section className="mt-7 grid gap-7 rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b286f] to-[#07143d] p-5 sm:grid-cols-[240px_1fr] sm:p-8">
              <div className="overflow-hidden rounded-2xl bg-[#020824]">
                {content.posterUrl ? (
                  <img
                    src={content.posterUrl}
                    alt=""
                    className="aspect-[3/4] w-full object-cover"
                  />
                ) : (
                  <div className="grid aspect-[3/4] place-items-center text-cyan-200/60">
                    <Tv2 size={56} />
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                  {content.category} · {content.contentRating}
                </p>
                <h1 className="mt-3 text-3xl font-black sm:text-4xl">{content.title}</h1>
                <p className="mt-3 text-sm leading-7 text-blue-100/65">{content.description}</p>
                <p className="mt-4 text-sm text-blue-100/60">Channel: {content.channelId}</p>
                <p className="mt-2 text-sm text-blue-100/60">
                  {content.averageStars.toFixed(1)} / 5 · {content.ratingCount} ratings
                </p>
                <p className="mt-3 text-sm font-bold text-cyan-200">
                  {content.ratePerMinuteMinor > 0
                    ? money(content.ratePerMinuteMinor, content.currency) + " per minute"
                    : "Free viewing"}
                </p>

                {/* Resume Prompt Banner if saved point exists */}
                {savedResumeTime > 0 && !sessionId && !hasPromptedResume && (
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-xs text-cyan-200">
                    <div className="flex items-center gap-2">
                      <RotateCcw size={16} className="text-cyan-300 shrink-0" />
                      <span>Resume playback from {formatSeconds(savedResumeTime)}?</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setHasPromptedResume(true);
                          void startPlayback(savedResumeTime);
                        }}
                        className="rounded-lg bg-cyan-400 px-3 py-1 font-bold text-slate-950 hover:brightness-110"
                      >
                        Resume
                      </button>
                      <button
                        type="button"
                        onClick={() => setHasPromptedResume(true)}
                        className="text-slate-400 hover:text-white"
                      >
                        Start over
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    disabled={busy || Boolean(sessionId) || content.deliveryMode !== "bq_hosted"}
                    onClick={() => void startPlayback(hasPromptedResume ? 0 : savedResumeTime)}
                    className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-extrabold text-[#031039] disabled:opacity-50 hover:brightness-110 transition"
                  >
                    <Play size={16} fill="currentColor" /> {busy ? "Starting…" : "Watch now"}
                  </button>
                  {sessionId ? (
                    <button
                      disabled={busy}
                      onClick={() => void endPlayback()}
                      className="rounded-xl border border-white/20 px-5 py-3 text-sm font-bold hover:bg-white/10 transition"
                    >
                      End playback
                    </button>
                  ) : null}
                </div>
                {content.deliveryMode !== "bq_hosted" ? (
                  <p className="mt-3 text-xs text-amber-200/80">
                    External-provider playback is unavailable until its authorized provider adapter
                    is configured and verified.
                  </p>
                ) : null}
                {!content.rightsCurrent ? (
                  <p className="mt-3 text-xs text-amber-200/80">
                    The rights record is not currently verified for playback. The server will block
                    playback until rights are valid.
                  </p>
                ) : null}
                <p className="mt-3 flex items-center gap-2 text-[11px] text-blue-100/40">
                  <ShieldCheck size={14} /> Playback rights and wallet charges are checked by the
                  server.
                </p>
              </div>
            </section>

            {/* Video Player Section with Batch 5 Controls */}
            {playbackUrl ? (
              <section className="mt-7 rounded-3xl border border-cyan-300/20 bg-[#07143d] p-4 sm:p-6 space-y-4">
                {/* Low Balance Warning */}
                {wallet && content.ratePerMinuteMinor > 0 && (wallet.balanceMinor / content.ratePerMinuteMinor) < 5 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-amber-200">
                    <div className="flex items-center gap-2.5 text-xs">
                      <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                      <span>
                        <strong>Low balance alert:</strong> Under 5 minutes of viewing credit remaining. Top up to prevent stream interruption.
                      </span>
                    </div>
                    <Link
                      to="/wallet"
                      className="rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-300 transition"
                    >
                      Top up
                    </Link>
                  </div>
                ) : null}
                <div className="relative overflow-hidden rounded-2xl bg-black">
                  <video
                    ref={videoRef}
                    src={playbackUrl}
                    controls
                    playsInline
                    className="aspect-video w-full bg-black"
                    onPlay={() => {
                      playbackStateRef.current = "playing";
                    }}
                    onPause={() => {
                      playbackStateRef.current = "paused";
                    }}
                    onWaiting={() => {
                      playbackStateRef.current = "buffering";
                    }}
                    onEnded={() => {
                      playbackStateRef.current = "ended";
                      void endPlayback();
                    }}
                    onError={() =>
                      setError("This browser could not play the stream. Try a supported browser.")
                    }
                  />

                  {/* Skip Intro Overlay Button */}
                  {showSkipIntro && (
                    <button
                      type="button"
                      onClick={handleSkipIntro}
                      className="absolute bottom-16 right-6 z-20 flex items-center gap-1.5 rounded-xl border border-white/30 bg-black/80 px-4 py-2 text-xs font-bold text-white shadow-xl hover:bg-white/20 transition"
                    >
                      <FastForward size={14} /> Skip Intro
                    </button>
                  )}

                  <img
                    src="/brand/bq-sqwad-tv-logo.png"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute right-4 top-4 w-20 opacity-40"
                  />
                  {sessionId && (
                    <div className="pointer-events-none absolute bottom-4 left-4 z-10 select-none opacity-30">
                      <span className="font-mono text-[10px] font-semibold text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        Viewer #{sessionId.slice(-6).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Per-Second Viewing Meter Transparency */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/20 bg-[#030e28] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                      <Wallet size={16} />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Live Viewing Meter
                      </p>
                      <p className="text-xs text-slate-200">
                        Elapsed:{" "}
                        <strong className="tabular-nums font-mono text-cyan-300">
                          {formatSeconds(elapsedSeconds)}
                        </strong>{" "}
                        · Cost:{" "}
                        <strong className="text-white">
                          {money(calculatedCostMinor, content.currency)}
                        </strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTogglePiP}
                      title="Picture in Picture"
                      aria-label="Picture in picture"
                      className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"
                    >
                      <PictureInPicture2 size={14} />
                      <span className="hidden sm:inline">PiP</span>
                    </button>

                    {nextEpisodeAvailable && (
                      <button
                        type="button"
                        onClick={() => {
                          setMessage("Starting next episode...");
                        }}
                        className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:brightness-110"
                      >
                        <FastForward size={14} />
                        <span>Next Episode</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Player Preferences: Speed, Subtitles, Audio, Quality */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  {/* Playback Speed */}
                  <div className="rounded-2xl border border-white/10 bg-[#040f33] p-3 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Sliders size={12} /> Speed
                    </label>
                    <select
                      value={playbackSpeed}
                      onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-2.5 py-1 text-xs text-white focus:outline-none"
                    >
                      <option value="0.75">0.75x</option>
                      <option value="1.0">1.0x Normal</option>
                      <option value="1.25">1.25x</option>
                      <option value="1.5">1.5x</option>
                      <option value="2.0">2.0x</option>
                    </select>
                  </div>

                  {/* Subtitles Track */}
                  <div className="rounded-2xl border border-white/10 bg-[#040f33] p-3 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Subtitles size={12} /> Subtitles
                    </label>
                    <select
                      value={selectedSubtitle}
                      onChange={(e) => setSelectedSubtitle(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-2.5 py-1 text-xs text-white focus:outline-none"
                    >
                      <option value="off">Off</option>
                      <option value="en">English [CC]</option>
                      <option value="fr">Français</option>
                      <option value="sw">Kiswahili</option>
                      <option value="ha">Hausa</option>
                      <option value="yo">Yorùbá</option>
                    </select>
                  </div>

                  {/* Audio Language */}
                  <div className="rounded-2xl border border-white/10 bg-[#040f33] p-3 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Volume2 size={12} /> Audio
                    </label>
                    <select
                      value={selectedAudio}
                      onChange={(e) => setSelectedAudio(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-2.5 py-1 text-xs text-white focus:outline-none"
                    >
                      <option value="original">Original Audio</option>
                      <option value="en">English Commentary</option>
                      <option value="fr">French Dub</option>
                      <option value="sw">Swahili Dub</option>
                    </select>
                  </div>

                  {/* Quality Picker */}
                  <div className="rounded-2xl border border-white/10 bg-[#040f33] p-3 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Film size={12} /> Quality
                    </label>
                    <select
                      value={selectedQuality}
                      onChange={(e) => setSelectedQuality(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-2.5 py-1 text-xs text-white focus:outline-none"
                    >
                      <option value="auto">Auto Adaptive</option>
                      <option value="1080p">1080p Full HD</option>
                      <option value="720p">720p HD</option>
                      <option value="480p">480p SD</option>
                      <option value="data_saver">Data Saver</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs text-blue-100/45">
                  Playback metering uses server heartbeats. Keep this page open while watching.
                </p>
              </section>
            ) : null}

            <section className="mt-7 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6">
                <h2 className="text-xl font-bold">Rate this title</h2>
                <div
                  className="mt-4 flex gap-2"
                  aria-label="Choose a rating from one to five stars"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      onClick={() => void rateContent(value)}
                      aria-label={value + " stars"}
                      className={value <= stars ? "text-amber-300" : "text-white/30"}
                    >
                      <Star size={26} fill="currentColor" />
                    </button>
                  ))}
                </div>
              </div>
              <form
                onSubmit={submitComment}
                className="grid gap-3 rounded-3xl border border-white/10 bg-[#07143d] p-6"
              >
                <h2 className="text-xl font-bold">Join the conversation</h2>
                <textarea
                  required
                  minLength={2}
                  maxLength={1500}
                  rows={4}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Write a respectful comment…"
                  className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-sm text-white"
                />
                <button
                  disabled={busy || !comment.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-extrabold text-[#031039] disabled:opacity-50"
                >
                  <Send size={15} /> Submit for moderation
                </button>
              </form>
            </section>
            <section className="mt-7 rounded-3xl border border-white/10 bg-[#07143d] p-6">
              <h2 className="text-xl font-bold">Viewer comments</h2>
              {comments.length ? (
                <div className="mt-4 divide-y divide-white/10">
                  {comments.map((item) => (
                    <article key={item.id} className="py-4">
                      <p className="text-sm leading-6 text-blue-100/80">{item.body}</p>
                      <p className="mt-2 text-[11px] text-blue-100/40">
                        {item.viewerNumber} ·{" "}
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleDateString()
                          : "Recently"}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-blue-100/50">No approved comments yet.</p>
              )}
            </section>
            {message ? (
              <p
                role="status"
                className="mt-5 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4 text-sm text-cyan-100"
              >
                {message}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
