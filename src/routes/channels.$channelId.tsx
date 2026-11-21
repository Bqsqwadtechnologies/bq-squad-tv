import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Radio,
  RotateCcw,
  Tv2,
  Wallet,
  Volume2,
  VolumeX,
  ThumbsUp,
  ThumbsDown,
  Users,
  Share2,
  Check,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

type Channel = {
  id: string;
  title: string;
  category: string;
  posterUrl: string | null;
  isLive: boolean;
  currentProgramme: string | null;
  language: string | null;
  streamUrl?: string | null;
};

type Programme = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  description: string | null;
};

type ChannelDetails = {
  channel: Channel;
  schedule: Programme[];
  replays: Channel[];
};

export const Route = createFileRoute("/channels/$channelId")({
  component: ChannelPage,
  head: () => ({
    meta: [
      { title: "Live Player | BQ SQWAD TV" },
      { name: "description", content: "Watch live channels and view programme schedules." },
    ],
  }),
});

function ChannelPage() {
  const { channelId } = Route.useParams();
  const [details, setDetails] = useState<ChannelDetails | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [chat, setChat] = useState<
    Array<{ id: string; body: string; author: string; createdAt: string }>
  >([]);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatError, setChatError] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [reminders, setReminders] = useState<Record<string, boolean>>({});

  // Player state
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const overlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await restoreWebSession();
        const headers = token ? await getWebAuthHeaders(token) : {};
        const response = await fetch("/api/public/v1/wallet", { headers, cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (active && typeof data.balanceMinor === "number") setWalletBalance(data.balanceMinor);
        }
      } catch {
        // Wallet data is optional until the signed-in wallet endpoint responds.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setSessionElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("bq_programme_reminders");
      if (stored) setReminders(JSON.parse(stored));
    } catch {
      // Ignore localStorage errors.
    }
  }, []);

  const formatElapsed = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  const toggleProgrammeReminder = (id: string, title: string) => {
    setReminders((previous) => {
      const updated = { ...previous, [id]: !previous[id] };
      try {
        localStorage.setItem("bq_programme_reminders", JSON.stringify(updated));
      } catch {
        /* Ignore storage errors. */
      }
      return updated;
    });
    window.dispatchEvent(new CustomEvent("viewer-reminder", { detail: { title } }));
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        setBusy(true);
        const token = await restoreWebSession();
        const headers = token ? await getWebAuthHeaders(token) : {};
        const response = await fetch("/api/public/v1/channels/" + encodeURIComponent(channelId), {
          headers,
          cache: "no-store",
        });
        const data = (await response.json()) as ChannelDetails & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "This channel is not available right now.");
        if (active) setDetails(data);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "This channel is not available right now.");
          setDetails(null);
        }
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [channelId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const token = await restoreWebSession();
        const headers = token ? await getWebAuthHeaders(token) : {};
        const response = await fetch(
          `/api/public/v1/channels/${encodeURIComponent(channelId)}/chat`,
          { headers, cache: "no-store" },
        );
        const data = await response.json();
        if (response.ok && active) {
          setChatEnabled(data.enabled === true);
          setChat(data.messages ?? []);
          setChatError("");
        } else if (active) {
          setChatEnabled(false);
          setChatError(data.message ?? "Live chat is unavailable.");
        }
      } catch {
        if (active) setChatError("Live chat is unavailable.");
      }
    };
    void load();
    const timer = window.setInterval(load, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [channelId]);

  async function submitChat(action: "SEND" | "REPORT", messageId?: string) {
    setChatBusy(true);
    setChatError("");
    try {
      const token = await restoreWebSession();
      const headers = token ? await getWebAuthHeaders(token) : {};
      const response = await fetch(
        `/api/public/v1/channels/${encodeURIComponent(channelId)}/chat`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "SEND" ? { action, body: chatText } : { action, messageId, reason: "other" },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Chat action failed.");
      if (action === "SEND") {
        setChatText("");
        setChat((items) =>
          [
            ...items,
            {
              id: data.messageId,
              body: chatText,
              author: "You",
              createdAt: new Date().toISOString(),
            },
          ].slice(-100),
        );
      }
    } catch (caught) {
      setChatError(caught instanceof Error ? caught.message : "Chat action failed.");
    } finally {
      setChatBusy(false);
    }
  }

  function handleUserInteraction() {
    setOverlayVisible(true);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => {
      if (isPlaying) setOverlayVisible(false);
    }, 3000);
  }

  function toggleFullscreen() {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  }

  async function togglePiP() {
    try {
      const video = playerContainerRef.current?.querySelector("video");
      if (video && document.pictureInPictureEnabled) {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      }
    } catch (_err) {
      void _err;
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#030B2A] via-[#07143D] to-[#0A1A4A] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between pb-6 border-b border-white/10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#00D8F5] hover:underline"
          >
            <ArrowLeft size={18} /> Back to Home
          </Link>
          <BrandLogo variant="horizontal" className="h-7 w-auto" />
        </div>

        {details ? (
          <div className="mt-6 space-y-6">
            {/* Player Container */}
            <div
              ref={playerContainerRef}
              onMouseMove={handleUserInteraction}
              onClick={handleUserInteraction}
              className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl group"
            >
              {/* Simulated / Real Stream Video Element */}
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#061238] via-black to-[#0A1A4A]">
                <div className="text-center">
                  <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-[#00D8F5]/30 bg-[#00D8F5]/10 text-[#00D8F5] shadow-[0_0_30px_rgba(0,216,245,0.25)]">
                    <Tv2 size={42} />
                  </div>
                  <p className="mt-4 text-sm font-bold text-slate-300">
                    {details.channel.title} · Live Broadcast
                  </p>
                </div>
              </div>

              {/* Player Overlay Controls */}
              <div
                className={`absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/80 via-transparent to-black/60 p-4 sm:p-6 transition-opacity duration-300 ${
                  overlayVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              >
                {/* Top overlay: live badge & title */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-0.5 text-xs font-black tracking-wider text-white shadow-sm">
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse" /> LIVE
                    </span>
                    <span className="text-sm font-bold">{details.channel.title}</span>
                  </div>
                  <span className="flex items-center gap-2 text-xs text-slate-300 font-medium">
                    <span
                      className="rounded-full bg-black/50 px-2 py-1 tabular-nums"
                      aria-label="Viewing time"
                    >
                      {formatElapsed(sessionElapsed)}
                    </span>
                    1080p HD
                  </span>
                </div>

                {/* Center play/pause touch */}
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPlaying(!isPlaying);
                    }}
                    className="grid h-16 w-16 place-items-center rounded-full bg-[#00D8F5]/20 text-[#00D8F5] backdrop-blur-md transition hover:scale-110"
                  >
                    {isPlaying ? (
                      <Pause size={28} />
                    ) : (
                      <Play size={28} className="translate-x-0.5" />
                    )}
                  </button>
                </div>

                {/* Bottom overlay: glowing cyan progress bar & action controls */}
                <div className="space-y-3">
                  <div className="relative h-1.5 w-full rounded-full bg-white/20">
                    <div className="absolute left-0 top-0 h-full w-full rounded-full bg-gradient-to-r from-[#0052D4] to-[#00D8F5] shadow-[0_0_12px_rgba(0,216,245,0.8)]" />
                  </div>

                  <div className="flex items-center justify-between text-slate-200">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsMuted(!isMuted);
                        }}
                        className="hover:text-[#00D8F5]"
                      >
                        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                          setVolume(parseFloat(e.target.value));
                          setIsMuted(false);
                        }}
                        className="h-1.5 w-16 sm:w-24 accent-[#00D8F5] cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={togglePiP}
                        aria-label="Picture in picture"
                        className="hover:text-[#00D8F5]"
                      >
                        <PictureInPicture2 size={20} />
                      </button>
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        aria-label="Toggle fullscreen"
                        className="hover:text-[#00D8F5]"
                      >
                        {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Channel Info & Schedule Card */}
            <section className="rounded-3xl border border-white/10 bg-[#0C1738]/80 p-6 sm:p-8 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#00D8F5]">
                    {details.channel.category}
                  </span>
                  <h1 className="mt-1 text-2xl font-black sm:text-3xl">{details.channel.title}</h1>
                  <p className="mt-1 text-sm text-slate-300">
                    Now: {details.channel.currentProgramme ?? "Live Streaming Programme"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Like & Dislike */}
                  <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => void handleReaction("like")}
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
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
                        userReaction === "dislike" ? "bg-rose-400 text-slate-950 font-bold" : "text-slate-300 hover:text-white"
                      }`}
                    >
                      <ThumbsDown size={13} className={userReaction === "dislike" ? "fill-current" : ""} />
                      <span>{dislikeCount}</span>
                    </button>
                  </div>

                  {/* Watch Party */}
                  <button
                    type="button"
                    disabled={partyBusy}
                    onClick={() => void handleCreateWatchParty()}
                    className="flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-400/20 transition"
                  >
                    <Users size={13} />
                    <span>{partyBusy ? "Joining Party…" : "Watch Party"}</span>
                  </button>

                  {/* Share */}
                  <button
                    type="button"
                    onClick={handleShare}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition"
                  >
                    {copiedLink ? <Check size={13} className="text-emerald-400" /> : <Share2 size={13} />}
                    <span>{copiedLink ? "Copied" : "Share"}</span>
                  </button>

                  <span className="rounded-xl border border-cyan-400/30 bg-[#00D8F5]/10 px-3 py-1.5 text-xs font-bold text-[#00D8F5]">
                    Pay As You Go
                  </span>
                  <a
                    href={`/copyright-report?channelId=${encodeURIComponent(details.channel.id)}`}
                    className="flex items-center gap-1.5 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-300/20 transition"
                  >
                    <AlertTriangle size={14} />
                    <span>Report channel</span>
                  </a>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#081333] px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Radio className="h-4 w-4 text-cyan-300" />
                  <span>Viewing meter</span>
                  <strong className="tabular-nums text-white">
                    {formatElapsed(sessionElapsed)}
                  </strong>
                  {walletBalance !== null && (
                    <span className="text-xs text-slate-400">
                      Wallet balance:{" "}
                      {(walletBalance / 100).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  )}
                </div>
                {walletBalance !== null && walletBalance <= 0 && (
                  <Link
                    to="/wallet"
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950"
                  >
                    <Wallet className="h-4 w-4" />
                    Top up to continue
                  </Link>
                )}
              </div>

              {chatEnabled ? (
                <section
                  className="mt-6 rounded-2xl border border-white/10 bg-[#081333] p-5"
                  aria-label="Live chat"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-white">Live chat</h2>
                    <span className="text-xs text-slate-400">
                      Be kind. Never share personal details.
                    </span>
                  </div>
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto" aria-live="polite">
                    {chat.map((message) => (
                      <div
                        key={message.id}
                        className="flex items-start justify-between gap-3 rounded-lg bg-white/5 px-3 py-2"
                      >
                        <p className="min-w-0 text-sm">
                          <strong className="mr-2 text-cyan-300">{message.author}</strong>
                          <span className="break-words text-slate-100">{message.body}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => void submitChat("REPORT", message.id)}
                          className="shrink-0 text-xs text-slate-400 hover:text-white"
                          aria-label="Report message"
                        >
                          Report
                        </button>
                      </div>
                    ))}
                    {chat.length === 0 ? (
                      <p className="text-sm text-slate-400">No messages yet.</p>
                    ) : null}
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitChat("SEND");
                    }}
                  >
                    <input
                      value={chatText}
                      onChange={(event) => setChatText(event.target.value)}
                      maxLength={500}
                      placeholder="Write a message"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                    />
                    <button
                      disabled={chatBusy || !chatText.trim()}
                      className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </form>
                  {chatError ? (
                    <p className="mt-2 text-sm text-rose-300" role="status">
                      {chatError}
                    </p>
                  ) : null}
                </section>
              ) : chatError ? (
                <p className="mt-4 text-sm text-slate-400">
                  Live chat is unavailable for this channel.
                </p>
              ) : null}

              {/* Schedule */}
              <div className="mt-6">
                <div className="flex items-center gap-2 text-[#00D8F5]">
                  <CalendarDays size={18} />
                  <h2 className="text-base font-bold text-white">Programme Schedule</h2>
                </div>
                <div className="mt-4 divide-y divide-white/10">
                  {details.schedule.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-4 py-3.5">
                      <div>
                        <p className="text-sm font-bold text-white">{item.title}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(item.startsAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          –{" "}
                          {new Date(item.endsAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {item.description ? (
                          <p className="mt-1 text-xs text-slate-300">{item.description}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleProgrammeReminder(item.id, item.title)}
                        className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-300/40 hover:text-cyan-200"
                      >
                        {reminders[item.id] ? "Reminder set" : "Remind me"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : busy ? (
          <div className="mt-16 text-center text-sm text-slate-400">Loading channel…</div>
        ) : (
          <div className="mt-16 rounded-2xl border border-white/10 bg-[#07143D] p-8 text-center">
            <p className="text-base font-bold text-white">{error || "Channel Unavailable"}</p>
            <p className="mt-2 text-xs text-slate-400">This broadcast feed is currently offline or unreachable.</p>
          </div>
        )}
      </div>
    </main>
  );
}
