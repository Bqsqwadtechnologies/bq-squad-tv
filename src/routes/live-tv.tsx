import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { ViewerBottomNav } from "@/components/ViewerBottomNav";
import { ProfileAccountHub } from "@/components/ProfileAccountHub";
import {
  AlertCircle,
  Bell,
  BellRing,
  Calendar,
  Clock,
  Film,
  Grid,
  ListFilter,
  Play,
  Radio,
  Search,
  Sparkles,
  Tv2,
  Users,
  Wallet,
} from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/live-tv")({
  component: LiveTvPage,
  head: () => ({
    meta: [
      { title: "Live TV Channels & Programme Guide — BQ SQWAD TV" },
      {
        name: "description",
        content:
          "Watch high-definition live channels, sports, news, and entertainment with real-time programme guides on BQ SQWAD TV.",
      },
    ],
  }),
});

type LiveChannel = {
  id: string;
  name: string;
  category: string;
  currentShow: string;
  nextShow: string;
  viewersCount: number;
  thumbnailUrl: string;
  isLive: boolean;
};

type ScheduleItem = {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  time: string;
  category: string;
  synopsis: string;
};


const DEFAULT_CHANNELS: LiveChannel[] = [
  {
    id: "ch-prime",
    name: "BQ SQWAD Prime Live",
    category: "Entertainment",
    currentShow: "Prime Global Showcase — Live Concert",
    nextShow: "Late Night African Beats",
    viewersCount: 2480,
    thumbnailUrl: "/brand/og-image.png",
    isLive: true,
  },
  {
    id: "ch-sports",
    name: "Super League Football",
    category: "Sports",
    currentShow: "Matchday Live: Lagos vs Nairobi",
    nextShow: "Post-Match Analysis",
    viewersCount: 1850,
    thumbnailUrl: "/brand/og-image.png",
    isLive: true,
  },
];

const DEFAULT_SCHEDULE: ScheduleItem[] = [
  {
    id: "sch-1",
    channelId: "ch-prime",
    channelName: "BQ SQWAD Prime Live",
    title: "Pan-African Evening News Bulletin",
    time: "20:00",
    category: "News",
    synopsis: "Live breaking coverage and analysis across African hubs and global business.",
  },
  {
    id: "sch-2",
    channelId: "ch-sports",
    channelName: "Super League Football",
    title: "Super League Championship Final",
    time: "21:30",
    category: "Sports",
    synopsis: "Continental championship final clash live with multi-camera replay.",
  },
];
function LiveTvPage() {
  const [channels, setChannels] = useState<LiveChannel[]>(DEFAULT_CHANNELS);
  const [schedule, setSchedule] = useState<ScheduleItem[]>(DEFAULT_SCHEDULE);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "guide">("grid");
  const [reminders, setReminders] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isLowBalance, setIsLowBalance] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("bq_programme_reminders");
      if (stored) {
        setReminders(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/public/v1/catalog/home", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data.channels)) {
            const liveChannels: LiveChannel[] = data.channels.map((c: any) => ({
              id: c.id,
              name: c.name || c.title || "Live Channel",
              category: c.category || "General",
              currentShow: c.currentShow || "Live Broadcast",
              nextShow: c.nextShow || "Upcoming Broadcast",
              viewersCount: typeof c.currentViewers === "number" ? c.currentViewers : (typeof c.viewersCount === "number" ? c.viewersCount : 0),
              thumbnailUrl: c.thumbnailUrl || "/brand/og-image.png",
              isLive: true,
            }));
            setChannels(liveChannels);
          }
        }
      } catch {
        // Fallback or offline
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await restoreWebSession();
        const headers = session ? await getWebAuthHeaders(session) : {};
        const res = await fetch("/api/public/v1/wallet", { headers, cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (active && typeof data.balanceMinor === "number") {
            setWalletBalance(data.balanceMinor);
            if (data.balanceMinor <= 0) {
              setIsLowBalance(true);
            }
          }
        }
      } catch {
        // Fallback or guest user
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const toggleReminder = (id: string, programmeTitle: string) => {
    setReminders((prev) => {
      const updated = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem("bq_programme_reminders", JSON.stringify(updated));
      } catch {
        // Ignore localStorage error
      }
      const isNowSet = updated[id];
      setToastMessage(
        isNowSet
          ? `Reminder set for "${programmeTitle}"`
          : `Reminder removed for "${programmeTitle}"`,
      );
      setTimeout(() => setToastMessage(null), 3000);
      return updated;
    });
  };

  const categories = ["All", "Entertainment", "News", "Sports", "Music", "Movies"];

  const filteredChannels = channels.filter((ch) => {
    const matchesCategory = selectedCategory === "All" || ch.category === selectedCategory;
    const matchesSearch =
      ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ch.currentShow.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const filteredSchedule = schedule.filter((item) => {
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.channelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.synopsis.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#030B2A] via-[#07143D] to-[#0A1A4A] text-white pb-24 md:pb-12">
      {/* Toast alert */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-2xl border border-cyan-400/40 bg-[#07143D]/95 px-4 py-3 text-xs font-bold text-cyan-300 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2"
        >
          <BellRing className="h-4 w-4 text-cyan-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Background ambient lighting */}
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-72 left-1/2 h-[40rem] w-[60rem] -translate-x-1/2 rounded-full bg-[#0052D4]/20 blur-[140px]" />
        <div className="absolute right-[-10rem] top-[24rem] h-[30rem] w-[30rem] rounded-full bg-[#00D8F5]/10 blur-[130px]" />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-30 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-8">
        <div className="flex items-center gap-6">
          <Link to="/" aria-label="BQ SQWAD TV home" className="flex items-center">
            <BrandLogo variant="horizontal" className="h-8 w-auto sm:h-9" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-300 md:flex">
            <Link to="/" className="transition hover:text-[#00D8F5]">
              Home
            </Link>
            <Link to="/live-tv" className="text-[#00D8F5] transition hover:text-white">
              Live TV
            </Link>
            <Link to="/library" className="transition hover:text-[#00D8F5]">
              Library
            </Link>
            <Link to="/downloads" className="transition hover:text-[#00D8F5]">
              Downloads
            </Link>
            <Link to="/settings" className="transition hover:text-[#00D8F5]">
              Settings
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/search"
            aria-label="Search"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20"
          >
            <Search size={18} />
          </Link>
          <Link
            to="/notifications"
            aria-label="Notifications"
            className="relative grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20"
          >
            <Bell size={18} />
          </Link>
          <ProfileAccountHub />
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-8 space-y-6">
        {/* Low-Balance Notice Banner (if balance is empty or low) */}
        {isLowBalance && (
          <div
            data-testid="low-balance-alert"
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 backdrop-blur-md"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/20 text-amber-400">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Low Balance Alert</p>
                <p className="text-[11px] text-amber-300/80">
                  Your wallet balance is depleted. Top up your account to continue streaming live
                  channels.
                </p>
              </div>
            </div>
            <Link
              to="/wallet"
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:brightness-110"
            >
              <Wallet className="h-3.5 w-3.5" />
              <span>Top up Now</span>
            </Link>
          </div>
        )}

        {/* Banner */}
        <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-r from-[#0052D4]/50 via-[#0A2568]/40 to-[#030B2A]/80 p-6 sm:p-8 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                Live Broadcast Feeds
              </span>
              <h1 className="text-xl sm:text-3xl font-black uppercase tracking-tight text-white">
                Live TV Channels & Programme Guide
              </h1>
              <p className="text-xs sm:text-sm text-slate-300">
                Continuous live satellite feeds and web broadcasts with instant electronic programme
                guides
              </p>
            </div>
            {channels.length > 0 && (
              <div className="flex items-center gap-3">
                <Link
                  to="/channels/$channelId"
                  params={{ channelId: channels[0].id }}
                  className="flex items-center gap-2 rounded-2xl bg-cyan-400 px-5 py-2.5 text-xs font-bold text-[#030e28] shadow-md shadow-cyan-400/20 transition hover:brightness-110"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>Watch Featured Channel</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Mode Switcher & Category Filters */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            {/* View Mode Buttons */}
            <div className="flex items-center rounded-2xl border border-white/10 bg-[#07143D]/60 p-1 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  viewMode === "grid"
                    ? "bg-cyan-400 text-[#030e28] shadow-md shadow-cyan-400/20"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <Grid className="h-3.5 w-3.5" />
                <span>Channels Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("guide")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  viewMode === "guide"
                    ? "bg-cyan-400 text-[#030e28] shadow-md shadow-cyan-400/20"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Programme Guide</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="w-full sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search live channels & shows..."
                className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-xl px-4 py-1.5 text-xs font-bold transition ${
                  selectedCategory === cat
                    ? "bg-cyan-400 text-[#030e28] shadow-md shadow-cyan-400/20"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* View Mode: Channel Grid */}
        {viewMode === "grid" && (
          filteredChannels.length === 0 ? (
            <div
              data-testid="empty-live-channels"
              className="rounded-3xl border border-white/10 bg-[#07143D]/60 p-12 text-center backdrop-blur-xl shadow-xl space-y-4"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
                <Tv2 className="h-8 w-8 text-slate-500" />
              </div>
              <h3 className="text-base font-bold text-white">No live channels available right now</h3>
              <p className="max-w-sm mx-auto text-xs text-slate-400 leading-relaxed">
                Check back soon for upcoming live broadcasts, sports events, and cultural shows.
              </p>
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-2xl bg-cyan-400 px-6 py-2.5 text-xs font-bold text-[#030e28] shadow-md shadow-cyan-400/20 hover:brightness-110"
              >
                <span>Return to Home</span>
              </Link>
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredChannels.map((channel) => (
              <div
                key={channel.id}
                className="group relative rounded-3xl border border-white/10 bg-[#07143D]/80 p-5 backdrop-blur-xl shadow-lg transition hover:border-cyan-400/50 hover:bg-[#0c1f54]"
              >
                <Link
                  to="/channels/$channelId"
                  params={{ channelId: channel.id }}
                  className="block"
                >
                  {/* Channel Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
                        <Tv2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition">
                          {channel.name}
                        </h3>
                        <span className="text-[10px] font-medium text-slate-400 uppercase">
                          {channel.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                        LIVE
                      </span>
                      <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                        <Users className="h-3 w-3 text-cyan-400" />
                        {channel.viewersCount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Programme Guide: Now & Next */}
                  <div className="space-y-2 rounded-2xl border border-white/5 bg-[#030b2a] p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <Clock className="h-3.5 w-3.5 text-cyan-400 mt-0.5 shrink-0" />
                      <div className="overflow-hidden">
                        <span className="text-[10px] uppercase font-bold text-cyan-400 block">
                          Now Showing
                        </span>
                        <p className="font-bold text-white truncate text-[11px]">
                          {channel.currentShow}
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-white/5 pt-1.5 flex items-start gap-2">
                      <Calendar className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
                      <div className="overflow-hidden">
                        <span className="text-[10px] uppercase font-medium text-slate-400 block">
                          Up Next
                        </span>
                        <p className="text-slate-300 truncate text-[11px]">{channel.nextShow}</p>
                      </div>
                    </div>
                  </div>
                </Link>

                {/* Card Actions: Remind upcoming & Watch */}
                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-xs">
                  <button
                    type="button"
                    onClick={() => toggleReminder(channel.id, channel.nextShow)}
                    className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] font-semibold transition ${
                      reminders[channel.id]
                        ? "bg-cyan-400/20 text-cyan-300 border border-cyan-400/40"
                        : "border border-white/10 bg-white/5 text-slate-400 hover:text-white"
                    }`}
                  >
                    {reminders[channel.id] ? (
                      <>
                        <BellRing className="h-3.5 w-3.5 text-cyan-400" />
                        <span>Reminder Set</span>
                      </>
                    ) : (
                      <>
                        <Bell className="h-3.5 w-3.5" />
                        <span>Remind Me</span>
                      </>
                    )}
                  </button>

                  <Link
                    to="/channels/$channelId"
                    params={{ channelId: channel.id }}
                    className="flex items-center gap-1 font-bold text-cyan-400 hover:underline"
                  >
                    <span>Tune In</span>
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
          )
        )}

        {/* View Mode: Programme Guide */}
        {viewMode === "guide" && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-[#07143D]/80 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Full Electronic Programme Guide
                  </h2>
                  <p className="text-xs text-slate-400">
                    Schedule of upcoming broadcasts across all official channels. Set reminders to
                    get notified.
                  </p>
                </div>
              </div>

              <div className="mt-4 divide-y divide-white/5">
                {filteredSchedule.map((prog) => (
                  <div
                    key={prog.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 transition hover:bg-white/[0.02] rounded-xl px-2"
                  >
                    <div className="space-y-1 sm:max-w-xl">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-cyan-400/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                          {prog.time}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">
                          {prog.channelName}
                        </span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">
                          {prog.category}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white">{prog.title}</h3>
                      <p className="text-xs text-slate-300 leading-relaxed">{prog.synopsis}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleReminder(prog.id, prog.title)}
                        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                          reminders[prog.id]
                            ? "bg-cyan-400/20 text-cyan-300 border border-cyan-400/40"
                            : "border border-white/10 bg-white/5 text-slate-300 hover:text-white"
                        }`}
                      >
                        {reminders[prog.id] ? (
                          <>
                            <BellRing className="h-3.5 w-3.5 text-cyan-400" />
                            <span>Reminder Set</span>
                          </>
                        ) : (
                          <>
                            <Bell className="h-3.5 w-3.5" />
                            <span>Remind Me</span>
                          </>
                        )}
                      </button>

                      <Link
                        to="/channels/$channelId"
                        params={{ channelId: prog.channelId }}
                        className="rounded-xl bg-cyan-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:brightness-110"
                      >
                        Go to Channel
                      </Link>
                    </div>
                  </div>
                ))}

                {filteredSchedule.length === 0 && (
                  <div className="py-12 text-center text-slate-400">
                    <Clock className="mx-auto h-8 w-8 text-slate-500 mb-2" />
                    <p className="text-sm">No scheduled programmes match your criteria.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Shared Viewer Bottom Navigation */}
      <ViewerBottomNav activeTab="live-tv" />
    </div>
  );
}
