import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatMinorCurrency as money } from "@/lib/format-money";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, Play, Send, ShieldCheck, Star, Tv2 } from "lucide-react";
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

function ContentDetailsPage() {
  const { assetId } = Route.useParams();
  const [token, setToken] = useState("");
  const [content, setContent] = useState<Content | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef("");
  const sequenceRef = useRef(0);
  const playbackStateRef = useRef<PlaybackState>("idle");

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(path, {
      ...init,
      headers: { ...(await getWebAuthHeaders(token)), ...(init.headers ?? {}) },
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

  async function loadContent(idToken: string) {
    const headers = await getWebAuthHeaders(idToken);
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
    let active = true;
    void (async () => {
      try {
        const idToken = await restoreWebSession();
        if (!idToken) throw new Error("Sign in to view content details.");
        if (active) setToken(idToken);
        const headers = await getWebAuthHeaders(idToken);
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
    if (!sessionId || !token) return;
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
  }, [sessionId, token]);

  async function startPlayback() {
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
      setMessage("Playback session started. Charges are based on verified playback time.");
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
      await loadContent(token);
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

  return (
    <main className="min-h-screen bg-[#030b2a] px-4 py-7 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-cyan-200">
          <ArrowLeft size={16} /> Back to BQ SQWAD TV
        </a>
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
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    disabled={busy || Boolean(sessionId) || content.deliveryMode !== "bq_hosted"}
                    onClick={() => void startPlayback()}
                    className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-extrabold text-[#031039] disabled:opacity-50"
                  >
                    <Play size={16} fill="currentColor" /> {busy ? "Starting…" : "Watch now"}
                  </button>
                  {sessionId ? (
                    <button
                      disabled={busy}
                      onClick={() => void endPlayback()}
                      className="rounded-xl border border-white/20 px-5 py-3 text-sm font-bold"
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

            {playbackUrl ? (
              <section className="mt-7 rounded-3xl border border-cyan-300/20 bg-[#07143d] p-4 sm:p-6">
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
                  <img
                    src="/brand/bq-sqwad-tv-logo.png"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute right-4 top-4 w-20 opacity-40"
                  />
                  {session?.sessionId && (
                    <div className="pointer-events-none absolute bottom-4 left-4 z-10 select-none opacity-30">
                      <span className="font-mono text-[10px] font-semibold text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        Viewer #{session.sessionId.slice(-6).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {session?.sessionId && (
                    <div className="pointer-events-none absolute bottom-4 left-4 z-10 select-none opacity-30">
                      <span className="font-mono text-[10px] font-semibold text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        Viewer #{session.sessionId.slice(-6).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <p className="mt-3 text-xs text-blue-100/45">
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
