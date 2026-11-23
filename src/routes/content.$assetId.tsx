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
  ThumbsUp,
  ThumbsDown,
  BadgeCheck,
  Users,
  Flag,
  Moon,
  Bell,
} from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";
import { BrandWatermark } from "@/components/BrandWatermark";

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
  isPrivatePreview?: boolean;
  bqOriginalMark?: boolean;
  producer?: {
    slug: string;
    name: string;
    verified: boolean;
    blueVerified: boolean;
    brandOverlayText: string;
    brandOverlayLogoUrl: string | null;
  } | null;
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
  const [previewToken, setPreviewToken] = useState("");
  const [isPrivatePreview, setIsPrivatePreview] = useState(false);

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
  const [reporterOrganization, setReporterOrganization] = useState("");
  const [workClaimed, setWorkClaimed] = useState("");
  const [proofLinkOrPath, setProofLinkOrPath] = useState("");
  const [goodFaithStatement, setGoodFaithStatement] = useState(false);
  const [signature, setSignature] = useState("");
  const [rightsBasis, setRightsBasis] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportDeclaration, setReportDeclaration] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [nextEpisodeAvailable, setNextEpisodeAvailable] = useState(true);
  // Batch 10 Viewer features
  const [likeCount, setLikeCount] = useState<number>(0);
  const [dislikeCount, setDislikeCount] = useState<number>(0);
  const [userReaction, setUserReaction] = useState<"like" | "dislike" | null>(null);
  const [sleepTimer, setSleepTimer] = useState<string>("off");
  const [sleepTimerEndsAt, setSleepTimerEndsAt] = useState<number | null>(null);
  const [reminderActive, setReminderActive] = useState(false);
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [partyMaxParticipants, setPartyMaxParticipants] = useState(10);
  const [partyBusy, setPartyBusy] = useState(false);
  const [commentReportModalOpen, setCommentReportModalOpen] = useState(false);
  const [targetCommentId, setTargetCommentId] = useState("");
  const [commentReportReason, setCommentReportReason] = useState<"harassment" | "hate_speech" | "spam" | "inappropriate" | "spoiler" | "other">("spam");
  const [commentReportDetails, setCommentReportDetails] = useState("");
  const [commentReportBusy, setCommentReportBusy] = useState(false);


  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);


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
    const previewQuery = previewToken ? "?previewToken=" + encodeURIComponent(previewToken) : "";
    const contentResponse = await fetch(
      "/api/public/v1/content-assets/" + encodeURIComponent(assetId) + previewQuery,
      { headers, cache: "no-store" },
    );
    const contentResult = (await contentResponse.json()) as { content?: Content; error?: string };
    if (!contentResponse.ok || !contentResult.content)
      throw new Error(contentResult.error ?? "This content is not available.");
    let commentsResult: Comment[] = [];
    if (!previewToken) {
      const commentsResponse = await fetch(
        "/api/public/v1/content-assets/" + encodeURIComponent(assetId) + "/comments",
        { headers, cache: "no-store" },
      );
      const parsedComments = (await commentsResponse.json()) as Comment[] | { error?: string };
      if (!commentsResponse.ok || !Array.isArray(parsedComments))
        throw new Error(
          !Array.isArray(parsedComments)
            ? (parsedComments.error ?? "Comments are unavailable.")
            : "Comments are unavailable.",
        );
      commentsResult = parsedComments;
    }
    setContent(contentResult.content);
    setNextEpisodeAvailable(contentResult.content.category === "series");
    setComments(commentsResult);
    // Load reaction counts once for this content item.
    fetch("/api/public/v1/reactions?targetType=video&targetId=" + encodeURIComponent(assetId), { headers })
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.likeCount === "number") setLikeCount(data.likeCount);
        if (typeof data.dislikeCount === "number") setDislikeCount(data.dislikeCount);
        if (data.userReaction) setUserReaction(data.userReaction);
      })
      .catch(() => {});

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
        const params = new URLSearchParams(window.location.search);
        const grantToken = params.get("preview") === "true" ? params.get("previewToken") ?? "" : "";
        if (active) {
          setAuthToken(idAuthToken);
          setPreviewToken(grantToken);
          setIsPrivatePreview(Boolean(grantToken));
        }
        const headers = await getWebAuthHeaders(idAuthToken);
        const previewQuery = grantToken ? "?previewToken=" + encodeURIComponent(grantToken) : "";
        const contentResponse = await fetch(
          "/api/public/v1/content-assets/" + encodeURIComponent(assetId) + previewQuery,
          { headers, cache: "no-store" },
        );
        const contentResult = (await contentResponse.json()) as {
          content?: Content;
          error?: string;
        };
        if (!contentResponse.ok || !contentResult.content)
          throw new Error(contentResult.error ?? "This content is not available.");
        let commentsResult: Comment[] = [];
        if (!grantToken) {
          const commentsResponse = await fetch(
            "/api/public/v1/content-assets/" + encodeURIComponent(assetId) + "/comments",
            { headers, cache: "no-store" },
          );
          const parsedComments = (await commentsResponse.json()) as Comment[] | { error?: string };
          if (!commentsResponse.ok || !Array.isArray(parsedComments))
            throw new Error("Comments are unavailable.");
          commentsResult = parsedComments;
        }
        if (active) {
          setContent(contentResult.content);
          setNextEpisodeAvailable(contentResult.content.category === "series");
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
          ...(previewToken ? { previewToken } : {}),
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
      setMessage(isPrivatePreview ? "Private preview started. No viewing charges will be applied." : "Playback session started. Charges are based on verified playback time.");

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
              addedAt: new Date().toISOString().slice(0, 10),
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


  async function handleReaction(vote: "like" | "dislike") {
    const nextVote = userReaction === vote ? "none" : vote;
    try {
      const res = await api("/api/public/v1/reactions", {
        method: "POST",
        body: JSON.stringify({
          targetType: "video",
          targetId: assetId,
          reaction: nextVote,
          title: content?.title,
          posterUrl: content?.posterUrl,
        }),
      });
      if (typeof res["likeCount"] === "number") setLikeCount(res["likeCount"] as number);
      if (typeof res["dislikeCount"] === "number") setDislikeCount(res["dislikeCount"] as number);
      setUserReaction(res["userReaction"] as "like" | "dislike" | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save reaction.");
    }
  }

  async function handleCreateWatchParty() {
    if (!content) return;
    setPartyBusy(true);
    setError("");
    try {
      const res = await api("/api/public/v1/watch-parties/", {
        method: "POST",
        body: JSON.stringify({
          targetType: "movie",
          targetId: assetId,
          title: content.title,
          posterUrl: content.posterUrl,
          streamUrl: playbackUrl || null,
          contentRating: content.contentRating || "PG-13",
          maxParticipants: partyMaxParticipants,
        }),
      });
      if (res["party"] && (res["party"] as any).id) {
        window.location.assign(`/watch-party/${(res["party"] as any).id}?code=${(res["party"] as any).roomCode}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create watch party.");
    } finally {
      setPartyBusy(false);
      setPartyModalOpen(false);
    }
  }

  async function submitCommentReport(e: FormEvent) {
    e.preventDefault();
    if (!targetCommentId) return;
    setCommentReportBusy(true);
    try {
      await api("/api/public/v1/comment-reports", {
        method: "POST",
        body: JSON.stringify({
          commentId: targetCommentId,
          assetId,
          reason: commentReportReason,
          details: commentReportDetails,
        }),
      });
      setMessage("Comment report submitted for moderator review.");
      setCommentReportModalOpen(false);
      setCommentReportDetails("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to report comment.");
    } finally {
      setCommentReportBusy(false);
    }
  }

  function handleSleepTimerChange(mins: string) {
    setSleepTimer(mins);
    if (mins === "off") {
      setSleepTimerEndsAt(null);
    } else {
      const durationMs = parseInt(mins, 10) * 60 * 1000;
      setSleepTimerEndsAt(Date.now() + durationMs);
    }
  }

  useEffect(() => {
    if (!sleepTimerEndsAt) return;
    const interval = setInterval(() => {
      if (Date.now() >= sleepTimerEndsAt) {
        if (videoRef.current) {
          videoRef.current.pause();
          setMessage("Sleep timer reached. Playback paused.");
        }
        setSleepTimer("off");
        setSleepTimerEndsAt(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerEndsAt]);

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
    if (!reportDeclaration || !goodFaithStatement) {
      setError("Please confirm both statements of good faith and accuracy.");
      return;
    }
    if (!signature.trim()) {
      setError("Please provide an electronic signature.");
      return;
    }
    setReportBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public/v1/content-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "content_asset",
          targetId: assetId,
          reason: "copyright_infringement",
          details: reportDetails,
          reporterName,
          reporterEmail,
          reporterOrganization,
          workClaimed: workClaimed || rightsBasis,
          proofLinkOrPath,
          goodFaithStatement: true,
          signature,
          rightsHolderName,
          rightsHolderEmail,
          rightsBasis: rightsBasis || workClaimed,
          declaration: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The copyright report could not be submitted.");
      setReportOpen(false);
      setReportDetails("");
      setRightsBasis("");
      setWorkClaimed("");
      setProofLinkOrPath("");
      setSignature("");
      setGoodFaithStatement(false);
      setReportDeclaration(false);
      setMessage("Copyright report received. Video is now under review and counter-notice window is open.");
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
          <div className="flex flex-wrap items-center gap-2">
            {/* Reactions: Like & Dislike */}
            <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => void handleReaction("like")}
                title="Like"
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
                  userReaction === "like" ? "bg-cyan-400 text-slate-950 font-bold" : "text-slate-300 hover:text-white"
                }`}
              >
                <ThumbsUp size={13} className={userReaction === "like" ? "fill-current" : ""} />
                <span>{likeCount}</span>
              </button>
              <div className="h-3 w-px bg-white/10" />
              <button
                type="button"
                onClick={() => void handleReaction("dislike")}
                title="Dislike"
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
                  userReaction === "dislike" ? "bg-rose-400 text-slate-950 font-bold" : "text-slate-300 hover:text-white"
                }`}
              >
                <ThumbsDown size={13} className={userReaction === "dislike" ? "fill-current" : ""} />
                <span>{dislikeCount}</span>
              </button>
            </div>

            {/* Watch Together / Watch Party */}
            <button
              type="button"
              onClick={() => setPartyModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-400/20 transition"
            >
              <Users size={14} />
              <span>Watch Party</span>
            </button>

            {/* Watchlist Reminder */}
            <button
              type="button"
              onClick={() => {
                setReminderActive((prev) => !prev);
                setMessage(reminderActive ? "Watchlist reminder disabled." : "Reminder set! You will be notified of new episodes.");
              }}
              title="Toggle reminder"
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                reminderActive
                  ? "border-amber-400/40 bg-amber-400/20 text-amber-300"
                  : "border-white/10 bg-white/5 text-slate-300 hover:text-white"
              }`}
            >
              <Bell size={14} className={reminderActive ? "fill-amber-300" : ""} />
              <span className="hidden sm:inline">{reminderActive ? "Reminder On" : "Remind Me"}</span>
            </button>

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
              <span>Report this video</span>
            </button>
          </div>
        </div>

        {reportOpen && (
          <form onSubmit={submitCopyrightReport} className="mt-5 space-y-3 rounded-2xl border border-amber-300/20 bg-[#111b3b] p-4 sm:p-6">
            <div>
              <h2 className="text-sm font-bold text-amber-100 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                Report this video (Copyright / Ownership Notice)
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-300">
                Use this form to file a formal infringement notice. Submitting places this video under review and notifies the producer for counter-notice.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input required value={reporterName} onChange={(e) => setReporterName(e.target.value)} placeholder="Reporter full name *" className="rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
              <input required type="email" value={reporterEmail} onChange={(e) => setReporterEmail(e.target.value)} placeholder="Reporter contact email *" className="rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
              <input value={reporterOrganization} onChange={(e) => setReporterOrganization(e.target.value)} placeholder="Organization / Studio (optional)" className="rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={rightsHolderName} onChange={(e) => setRightsHolderName(e.target.value)} placeholder="Rights holder / Owner name" className="rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
              <input type="email" value={rightsHolderEmail} onChange={(e) => setRightsHolderEmail(e.target.value)} placeholder="Rights holder contact email" className="rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
            </div>
            <textarea required minLength={10} value={workClaimed || rightsBasis} onChange={(e) => { setWorkClaimed(e.target.value); setRightsBasis(e.target.value); }} placeholder="Identify the copyrighted work claimed to be infringed (title, registration, description) *" rows={3} className="w-full rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
            <input value={proofLinkOrPath} onChange={(e) => setProofLinkOrPath(e.target.value)} placeholder="Proof link, official catalogue entry or proof file URL (optional)" className="w-full rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
            <div className="space-y-2 rounded-xl border border-white/10 bg-[#071336] p-3 text-xs text-slate-300">
              <label className="flex items-start gap-2">
                <input type="checkbox" required checked={goodFaithStatement} onChange={(e) => setGoodFaithStatement(e.target.checked)} className="mt-0.5 accent-cyan-400" />
                <span>I have a good faith belief that the use of this content is not authorized by the copyright owner, agent, or the law.</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" required checked={reportDeclaration} onChange={(e) => setReportDeclaration(e.target.checked)} className="mt-0.5 accent-cyan-400" />
                <span>I confirm under penalty of perjury that the information provided is accurate and that I am the owner or authorized representative.</span>
              </label>
            </div>
            <div>
              <input required value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Electronic signature (type full legal name) *" className="w-full rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setReportOpen(false)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:text-white">Cancel</button>
              <button type="submit" disabled={reportBusy} className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50 hover:brightness-110">{reportBusy ? "Submitting…" : "Submit Report"}</button>
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
            {isPrivatePreview && (
              <div className="mt-6 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100">
                <strong>Private preview mode.</strong> This content is visible only through your authorised preview link. Playback is unbilled and does not publish the content.
              </div>
            )}
            <section className="mt-7 grid gap-7 rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b286f] to-[#07143d] p-5 sm:grid-cols-[240px_1fr] sm:p-8">
              <div className="relative overflow-hidden rounded-2xl bg-[#020824]">
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
                <BrandWatermark />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                  {content.category} · {content.contentRating}
                </p>
                <h1 className="mt-3 text-3xl font-black sm:text-4xl">{content.title}</h1>
                {content.producer && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-blue-100/60">By</span>
                    <Link to="/p/$slug" params={{ slug: content.producer.slug }} className="font-semibold text-cyan-200 hover:underline">
                      {content.producer.name}
                    </Link>
                    {content.producer.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-1 font-semibold text-cyan-200" title="Producer identity approved">
                        <BadgeCheck className="h-3.5 w-3.5" /> Verified producer
                      </span>
                    )}
                    {content.producer.blueVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-1 font-semibold text-blue-300" title="Monthly public verification active">
                        <BadgeCheck className="h-3.5 w-3.5" /> Blue tick
                      </span>
                    )}
                  </div>
                )}
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
                    <Play size={16} fill="currentColor" /> {busy ? "Starting…" : isPrivatePreview ? "Preview now" : "Watch now"}
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
                  <BrandWatermark />
                  {content.contentRating && (
                    <div className="absolute right-3 top-3 z-10 rounded-lg border border-white/20 bg-black/80 px-3 py-1.5 text-xs font-bold text-white">
                      AGE RATING: {content.contentRating}
                    </div>
                  )}
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

                  {content.bqOriginalMark && (
                    <a
                      href="/pages/bq-sqwad-originals"
                      className="absolute left-3 top-3 z-20 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/45 px-2.5 py-1.5 opacity-80 transition hover:opacity-100"
                      aria-label="BQ SQWAD TV Original. Learn more about the originality mark."
                    >
                      <img src="/brand/bq-sqwad-tv-logo.png" alt="" aria-hidden="true" className="h-5 w-auto max-w-12 object-contain" />
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-white">BQ SQWAD TV Original</span>
                      <span className="text-[9px] font-semibold text-cyan-200 underline">Learn more</span>
                    </a>
                  )}
                  {content.producer && (content.producer.brandOverlayLogoUrl || content.producer.brandOverlayText) && (
                    <div className="pointer-events-none absolute right-3 top-3 z-20 flex max-w-[38%] items-center justify-end gap-2 rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 opacity-70">
                      {content.producer.brandOverlayLogoUrl && (
                        <img src={content.producer.brandOverlayLogoUrl} alt="" className="max-h-9 max-w-16 object-contain" />
                      )}
                      {content.producer.brandOverlayText && (
                        <span className="truncate text-[10px] font-bold text-white drop-shadow">{content.producer.brandOverlayText}</span>
                      )}
                    </div>
                  )}
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

                    <button
                      type="button"
                      onClick={() => {
                        setReportOpen(true);
                        window.scrollTo({ top: 400, behavior: 'smooth' });
                      }}
                      title="Report this video"
                      aria-label="Report this video"
                      className="flex items-center gap-1.5 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-300/20 transition"
                    >
                      <AlertTriangle size={14} />
                      <span className="hidden sm:inline">Report</span>
                    </button>

                    {nextEpisodeAvailable && (
                      <button
                        type="button"
                        onClick={() => {
                          setMessage(
                            content?.category === "series"
                              ? "Next episode queued — preparing playback stream."
                              : "No additional episodes available for this feature."
                          );
                        }}
                        className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:brightness-110"
                      >
                        <FastForward size={14} />
                        <span>Next Episode</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Player Preferences: Speed, Subtitles, Audio, Quality, Sleep Timer */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
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

                  {/* Sleep Timer */}
                  <div className="rounded-2xl border border-white/10 bg-[#040f33] p-3 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Moon size={12} /> Sleep Timer
                    </label>
                    <select
                      value={sleepTimer}
                      onChange={(e) => handleSleepTimerChange(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-2.5 py-1 text-xs text-white focus:outline-none"
                    >
                      <option value="off">Off</option>
                      <option value="15">15 Minutes</option>
                      <option value="30">30 Minutes</option>
                      <option value="45">45 Minutes</option>
                      <option value="60">60 Minutes</option>
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
                    <article key={item.id} className="py-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm leading-6 text-blue-100/80">{item.body}</p>
                        <p className="mt-2 text-[11px] text-blue-100/40">
                          {item.viewerNumber} ·{" "}
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleDateString()
                            : "Recently"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTargetCommentId(item.id);
                          setCommentReportModalOpen(true);
                        }}
                        title="Report comment"
                        className="text-slate-500 hover:text-amber-400 transition p-1"
                      >
                        <Flag size={13} />
                      </button>
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

        {/* Watch Party Modal */}
        {partyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="max-w-md w-full rounded-3xl border border-cyan-400/30 bg-[#07143D] p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2 text-cyan-300">
                  <Users size={18} /> Start a Watch Party
                </h3>
                <button onClick={() => setPartyModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>
              <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                Watch with friends in sync! You host the room and control playback. Every participant is billed individually for their own watch time.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Maximum Participants (2 to 50)
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={partyMaxParticipants}
                    onChange={(e) => setPartyMaxParticipants(parseInt(e.target.value) || 10)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-slate-400">
                  <p className="font-bold text-slate-200 mb-1">Kids Safe Mode Protected</p>
                  <p>Restricted content ratings ({content?.contentRating || "G"}) will be enforced for all participants.</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setPartyModalOpen(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={partyBusy}
                    onClick={() => void handleCreateWatchParty()}
                    className="rounded-xl bg-cyan-400 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 transition"
                  >
                    {partyBusy ? "Creating Room…" : "Create Room & Join"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comment Report Modal */}
        {commentReportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <form onSubmit={submitCommentReport} className="max-w-md w-full rounded-3xl border border-amber-400/30 bg-[#07143D] p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2 text-amber-300">
                  <Flag size={18} /> Report Comment
                </h3>
                <button type="button" onClick={() => setCommentReportModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>
              <p className="text-xs text-slate-300 mb-4">
                Help us keep BQ SQWAD TV safe and welcoming. Why are you reporting this comment?
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Reason</label>
                  <select
                    value={commentReportReason}
                    onChange={(e) => setCommentReportReason(e.target.value as any)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white"
                  >
                    <option value="harassment">Harassment or Bullying</option>
                    <option value="hate_speech">Hate Speech</option>
                    <option value="spam">Spam or Scam</option>
                    <option value="inappropriate">Inappropriate Content</option>
                    <option value="spoiler">Major Unmarked Spoilers</option>
                    <option value="other">Other Violation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Additional Details (optional)</label>
                  <textarea
                    rows={3}
                    value={commentReportDetails}
                    onChange={(e) => setCommentReportDetails(e.target.value)}
                    placeholder="Describe what is wrong…"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCommentReportModalOpen(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={commentReportBusy}
                    className="rounded-xl bg-amber-400 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50 transition"
                  >
                    {commentReportBusy ? "Submitting…" : "Submit Report"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}


        {/* Watch Party Modal */}
        {partyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="max-w-md w-full rounded-3xl border border-cyan-400/30 bg-[#07143D] p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2 text-cyan-300">
                  <Users size={18} /> Start a Watch Party
                </h3>
                <button onClick={() => setPartyModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>
              <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                Watch with friends in sync! You host the room and control playback. Every participant is billed individually for their own watch time.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Maximum Participants (2 to 50)
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={partyMaxParticipants}
                    onChange={(e) => setPartyMaxParticipants(parseInt(e.target.value) || 10)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-slate-400">
                  <p className="font-bold text-slate-200 mb-1">Kids Safe Mode Protected</p>
                  <p>Restricted content ratings ({content?.contentRating || "G"}) will be enforced for all participants.</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setPartyModalOpen(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={partyBusy}
                    onClick={() => void handleCreateWatchParty()}
                    className="rounded-xl bg-cyan-400 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 transition"
                  >
                    {partyBusy ? "Creating Room…" : "Create Room & Join"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comment Report Modal */}
        {commentReportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <form onSubmit={submitCommentReport} className="max-w-md w-full rounded-3xl border border-amber-400/30 bg-[#07143D] p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2 text-amber-300">
                  <Flag size={18} /> Report Comment
                </h3>
                <button type="button" onClick={() => setCommentReportModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>
              <p className="text-xs text-slate-300 mb-4">
                Help us keep BQ SQWAD TV safe and welcoming. Why are you reporting this comment?
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Reason</label>
                  <select
                    value={commentReportReason}
                    onChange={(e) => setCommentReportReason(e.target.value as any)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white"
                  >
                    <option value="harassment">Harassment or Bullying</option>
                    <option value="hate_speech">Hate Speech</option>
                    <option value="spam">Spam or Scam</option>
                    <option value="inappropriate">Inappropriate Content</option>
                    <option value="spoiler">Major Unmarked Spoilers</option>
                    <option value="other">Other Violation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Additional Details (optional)</label>
                  <textarea
                    rows={3}
                    value={commentReportDetails}
                    onChange={(e) => setCommentReportDetails(e.target.value)}
                    placeholder="Describe what is wrong…"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCommentReportModalOpen(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={commentReportBusy}
                    className="rounded-xl bg-amber-400 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50 transition"
                  >
                    {commentReportBusy ? "Submitting…" : "Submit Report"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

      </div>
    </main>
  );
}
