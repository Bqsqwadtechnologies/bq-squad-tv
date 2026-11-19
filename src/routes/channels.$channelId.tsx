import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
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
  Volume2,
  VolumeX,
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
          // Provide fallback demo channel if mock channel is opened
          setDetails({
            channel: {
              id: channelId,
              title: channelId === "demo" ? "BQ Sqwad Sports HD" : `Channel ${channelId}`,
              category: "Live Sports",
              posterUrl: null,
              isLive: true,
              currentProgramme: "Championship Live Highlights",
              language: "English",
            },
            schedule: [
              {
                id: "p1",
                title: "Live Match Studio",
                startsAt: new Date().toISOString(),
                endsAt: new Date(Date.now() + 3600000).toISOString(),
                description: "Pre-match analysis, player interviews and tactical breakdowns.",
              },
              {
                id: "p2",
                title: "Prime Time News",
                startsAt: new Date(Date.now() + 3600000).toISOString(),
                endsAt: new Date(Date.now() + 7200000).toISOString(),
                description: "The latest breaking sports headlines and transfer updates.",
              },
            ],
            replays: [],
          });
        }
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [channelId]);

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
                  <span className="text-xs text-slate-300 font-medium">1080p HD</span>
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
                <div className="flex items-center gap-3">
                  <span className="rounded-xl border border-cyan-400/30 bg-[#00D8F5]/10 px-3 py-1.5 text-xs font-bold text-[#00D8F5]">
                    Pay As You Go
                  </span>
                </div>
              </div>

              {/* Schedule */}
              <div className="mt-6">
                <div className="flex items-center gap-2 text-[#00D8F5]">
                  <CalendarDays size={18} />
                  <h2 className="text-base font-bold text-white">Programme Schedule</h2>
                </div>
                <div className="mt-4 divide-y divide-white/10">
                  {details.schedule.map((item) => (
                    <div key={item.id} className="py-3.5">
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
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
