import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Film,
  MessageSquare,
  Pause,
  Play,
  Radio,
  Send,
  Share2,
  Shield,
  Trash2,
  Tv2,
  UserCheck,
  UserX,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

interface Participant {
  uid: string;
  email: string;
  joinedAt: string;
  billedMinutes: number;
  isHost?: boolean;
}

interface ChatMessage {
  id: string;
  senderUid: string;
  senderName: string;
  isHost: boolean;
  message: string;
  createdAt: string;
}

interface PartyState {
  id: string;
  roomCode: string;
  title: string;
  targetType: string;
  targetId: string;
  posterUrl: string | null;
  streamUrl: string | null;
  contentRating: string;
  maxParticipants: number;
  hostUid: string;
  hostEmail: string;
  playbackState: "playing" | "paused";
  currentTime: number;
  status: "active" | "ended";
  participants: Participant[];
  chatMessages: ChatMessage[];
}

export const Route = createFileRoute("/watch-party/$partyId")({
  component: WatchPartyPage,
  head: () => ({
    meta: [
      { title: "Watch Party | BQ SQWAD TV" },
      { name: "description", content: "Watch together with synced playback and live chat." },
      { property: "og:title", content: "Join my Watch Party on BQ SQWAD TV" },
      { property: "og:description", content: "Watch movies, live TV, and shows together in real time." },
      { property: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function WatchPartyPage() {
  const { partyId } = Route.useParams();
  const [token, setToken] = useState("");
  const [currentUid, setCurrentUid] = useState("");
  const [party, setParty] = useState<PartyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [myBilledMinutes, setMyBilledMinutes] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isHost = party ? party.hostUid === currentUid : false;

  // Initial load and session restore
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const idToken = await restoreWebSession();
        if (active && idToken) {
          setToken(idToken);
          // decode uid roughly or through headers
          try {
            const payload = JSON.parse(atob(idToken.split(".")[1] ?? ""));
            setCurrentUid(payload.user_id || payload.sub || "");
          } catch {
            // ignore
          }
        }

        const res = await fetch(`/api/public/v1/watch-parties/${encodeURIComponent(partyId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || "Failed to load watch party");

        if (active) {
          setParty(data);
          const me = (data.participants as Participant[])?.find((p) => p.uid === currentUid);
          if (me) setMyBilledMinutes(me.billedMinutes || 0);
        }

        // Join room if authenticated
        if (idToken) {
          await fetch(`/api/public/v1/watch-parties/${encodeURIComponent(partyId)}`, {
            method: "POST",
            headers: await getWebAuthHeaders(idToken),
            body: JSON.stringify({ action: "join" }),
          });
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Error connecting to party");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [partyId]);

  // Polling loop for party state sync & heartbeat
  useEffect(() => {
    if (!party || party.status === "ended") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/public/v1/watch-parties/${encodeURIComponent(partyId)}`);
        if (res.ok) {
          const data: PartyState = await res.json();
          setParty(data);

          // Sync video element
          if (videoRef.current && !isHost) {
            const v = videoRef.current;
            if (data.playbackState === "playing" && v.paused) {
              v.play().catch(() => {});
            } else if (data.playbackState === "paused" && !v.paused) {
              v.pause();
            }
            if (Math.abs(v.currentTime - data.currentTime) > 3) {
              v.currentTime = data.currentTime;
            }
          }
        }

        // Heartbeat for independent billing (every 60s)
        if (token) {
          const hbRes = await fetch(`/api/public/v1/watch-parties/${encodeURIComponent(partyId)}`, {
            method: "POST",
            headers: await getWebAuthHeaders(token),
            body: JSON.stringify({ action: "heartbeat" }),
          });
          if (hbRes.ok) {
            const hbData = await hbRes.json();
            if (typeof hbData.billedMinutes === "number") {
              setMyBilledMinutes(hbData.billedMinutes);
            }
          }
        }
      } catch {
        // Polling error silently handled
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [partyId, party?.status, isHost, token]);

  async function handleHostPlayback(action: "play" | "pause", seekTime?: number) {
    if (!isHost || !token || !party) return;
    const time = seekTime !== undefined ? seekTime : videoRef.current?.currentTime || 0;
    try {
      await fetch(`/api/public/v1/watch-parties/${encodeURIComponent(partyId)}`, {
        method: "POST",
        headers: await getWebAuthHeaders(token),
        body: JSON.stringify({
          action: "sync",
          playbackState: action === "play" ? "playing" : "paused",
          currentTime: time,
        }),
      });
      setParty((prev) => (prev ? { ...prev, playbackState: action === "play" ? "playing" : "paused", currentTime: time } : prev));
      if (videoRef.current) {
        if (action === "play") videoRef.current.play().catch(() => {});
        else videoRef.current.pause();
      }
    } catch {
      // Sync error
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    if (!chatMessage.trim() || !token || chatSending) return;
    setChatSending(true);
    try {
      const res = await fetch(`/api/public/v1/watch-parties/${encodeURIComponent(partyId)}`, {
        method: "POST",
        headers: await getWebAuthHeaders(token),
        body: JSON.stringify({ action: "chat", message: chatMessage.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setParty((prev) => prev ? { ...prev, chatMessages: [...(prev.chatMessages || []), data.message] } : prev);
        setChatMessage("");
      }
    } finally {
      setChatSending(false);
    }
  }

  async function handleKick(targetUid: string) {
    if (!isHost || !token) return;
    if (!confirm("Are you sure you want to remove this participant?")) return;
    try {
      await fetch(`/api/public/v1/watch-parties/${encodeURIComponent(partyId)}`, {
        method: "POST",
        headers: await getWebAuthHeaders(token),
        body: JSON.stringify({ action: "kick", targetUid }),
      });
      setParty((prev) => prev ? {
        ...prev,
        participants: prev.participants.filter((p) => p.uid !== targetUid),
      } : prev);
    } catch {
      // kick error
    }
  }

  async function handleEndParty() {
    if (!isHost || !token) return;
    if (!confirm("End this watch party for all participants?")) return;
    try {
      await fetch(`/api/public/v1/watch-parties/${encodeURIComponent(partyId)}`, {
        method: "POST",
        headers: await getWebAuthHeaders(token),
        body: JSON.stringify({ action: "end" }),
      });
      setParty((prev) => (prev ? { ...prev, status: "ended" } : prev));
    } catch {
      // end error
    }
  }

  function copyShareLink() {
    if (!party) return;
    const shareUrl = `${window.location.origin}/watch-party/${party.id}?code=${party.roomCode}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020817] flex items-center justify-center text-white p-4">
        <p className="text-cyan-400 animate-pulse text-sm">Connecting to Watch Party…</p>
      </main>
    );
  }

  if (error || !party) {
    return (
      <main className="min-h-screen bg-[#020817] flex flex-col items-center justify-center text-white p-4">
        <div className="max-w-md w-full bg-slate-900/80 border border-red-500/30 rounded-2xl p-6 text-center">
          <p className="text-red-400 font-bold mb-4">{error || "Watch party unavailable."}</p>
          <Link to="/" className="inline-flex items-center gap-2 text-cyan-400 text-sm font-semibold hover:underline">
            <ArrowLeft size={16} /> Return to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020817] text-white flex flex-col">
      {/* Top Header */}
      <header className="h-14 border-b border-white/10 px-4 flex items-center justify-between bg-black/40 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-sm font-bold truncate max-w-xs sm:max-w-md flex items-center gap-2">
              <span>{party.title}</span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">
                {party.targetType}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Room Code Badge */}
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl text-xs">
            <span className="text-slate-400">Code:</span>
            <span className="font-mono font-bold text-cyan-400 tracking-wider">{party.roomCode}</span>
            <button
              onClick={copyShareLink}
              title="Copy Share Link"
              className="ml-1 text-slate-400 hover:text-white transition"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            </button>
          </div>

          <button
            onClick={copyShareLink}
            className="hidden sm:flex items-center gap-1.5 bg-cyan-400 text-[#020817] px-3 py-1 rounded-xl text-xs font-bold hover:bg-cyan-300 transition"
          >
            <Share2 size={13} />
            <span>{copied ? "Copied Link!" : "Invite Friends"}</span>
          </button>

          {isHost && party.status === "active" && (
            <button
              onClick={handleEndParty}
              className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-1 rounded-xl text-xs font-semibold hover:bg-red-500/20 transition"
            >
              End Room
            </button>
          )}
        </div>
      </header>

      {/* Main Grid: Player on left, Party Sidebar on right */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 overflow-hidden">
        {/* Left: Player & Sync Controls */}
        <section className="lg:col-span-2 xl:col-span-3 flex flex-col bg-black border-b lg:border-b-0 lg:border-r border-white/10">
          <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              src={party.streamUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"}
              poster={party.posterUrl || undefined}
              controls={isHost}
              className="w-full h-full object-contain"
              onPlay={() => {
                if (isHost && party.playbackState !== "playing") handleHostPlayback("play");
              }}
              onPause={() => {
                if (isHost && party.playbackState !== "paused") handleHostPlayback("pause");
              }}
              onSeeked={() => {
                if (isHost) handleHostPlayback(party.playbackState === "playing" ? "play" : "pause", videoRef.current?.currentTime);
              }}
            />

            {/* Non-host synced state overlay */}
            {!isHost && (
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur border border-white/10 px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 text-cyan-300">
                <span className="size-2 rounded-full bg-cyan-400 animate-ping" />
                Synced with Host ({party.hostEmail.split("@")[0]})
              </div>
            )}
          </div>

          {/* Sync / Controls Bar */}
          <div className="p-4 bg-slate-900/50 border-t border-white/5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isHost ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleHostPlayback(party.playbackState === "playing" ? "pause" : "play")}
                    className="flex items-center gap-2 bg-cyan-400 text-[#020817] px-4 py-2 rounded-xl text-xs font-bold hover:bg-cyan-300 transition"
                  >
                    {party.playbackState === "playing" ? <Pause size={15} /> : <Play size={15} />}
                    <span>{party.playbackState === "playing" ? "Pause for All" : "Play for All"}</span>
                  </button>
                  <span className="text-xs text-slate-400">You control synced playback for the room</span>
                </div>
              ) : (
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span>Playback mode:</span>
                  <span className="font-semibold text-white capitalize">{party.playbackState}</span>
                </div>
              )}
            </div>

            {/* Individual Billing Meter */}
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-xs">
              <Clock size={14} className="text-cyan-400" />
              <span className="text-slate-400">Your Watch Time:</span>
              <span className="font-bold text-white">{myBilledMinutes} min</span>
              <span className="text-[10px] text-slate-500">(Billed individually)</span>
            </div>
          </div>
        </section>

        {/* Right: Sidebar with Participants & Live Chat */}
        <aside className="flex flex-col bg-[#050b18] overflow-hidden h-[500px] lg:h-auto">
          {/* Participants bar */}
          <div className="p-3 border-b border-white/10 bg-slate-900/40">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Users size={14} />
                <span>Party Watchers ({party.participants?.length || 0}/{party.maxParticipants})</span>
              </h2>
              <span className="text-[10px] text-cyan-400">{party.contentRating} rated</span>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {party.participants?.map((p) => (
                <div
                  key={p.uid}
                  className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg text-xs"
                >
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  <span className="font-medium truncate max-w-[90px]">{p.email.split("@")[0]}</span>
                  {p.isHost && <span className="text-[9px] bg-cyan-400/20 text-cyan-300 px-1 rounded">Host</span>}
                  {isHost && !p.isHost && (
                    <button
                      onClick={() => handleKick(p.uid)}
                      title="Kick participant"
                      className="text-red-400 hover:text-red-300 ml-0.5"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Live Chat Messages */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2 flex flex-col">
            <div className="text-center my-2">
              <span className="text-[11px] text-slate-500 bg-white/5 px-2.5 py-1 rounded-full">
                Welcome to {party.title} Watch Party!
              </span>
            </div>

            {party.chatMessages?.map((msg) => (
              <div
                key={msg.id}
                className={`text-xs p-2 rounded-xl max-w-[85%] ${
                  msg.senderUid === currentUid
                    ? "bg-cyan-500/20 border border-cyan-500/30 self-end text-cyan-100"
                    : "bg-white/5 border border-white/10 self-start text-slate-200"
                }`}
              >
                <div className="flex items-center gap-1 mb-0.5 text-[10px] text-slate-400 font-bold">
                  <span>{msg.senderName}</span>
                  {msg.isHost && <span className="text-[9px] text-cyan-400">★ Host</span>}
                </div>
                <p className="break-words leading-relaxed">{msg.message}</p>
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-white/10 bg-slate-900/60 flex gap-2">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Chat with the room…"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={!chatMessage.trim() || chatSending}
              className="bg-cyan-400 text-[#020817] p-2 rounded-xl disabled:opacity-40 hover:bg-cyan-300 transition"
            >
              <Send size={15} />
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}
