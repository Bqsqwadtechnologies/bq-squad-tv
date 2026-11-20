import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { ViewerBottomNav } from "@/components/ViewerBottomNav";
import { ProfileAccountHub } from "@/components/ProfileAccountHub";
import {
  Bell,
  Calendar,
  Clock,
  Eye,
  Film,
  Play,
  Radio,
  Search,
  Sparkles,
  Tv2,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/live-tv")({
  component: LiveTvPage,
  head: () => ({
    meta: [
      { title: "Live TV Channels & Programme Guide — BQ SQWAD TV" },
      {
        name: "description",
        content: "Watch high-definition live channels, sports, news, and entertainment with real-time programme guides on BQ SQWAD TV.",
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

const mockChannels: LiveChannel[] = [
  {
    id: "demo",
    name: "BQ SQWAD Prime Live",
    category: "Entertainment",
    currentShow: "Prime Global Showcase — Live Concert",
    nextShow: "Late Night African Beats",
    viewersCount: 2480,
    thumbnailUrl: "/brand/og-image.png",
    isLive: true,
  },
  {
    id: "news24",
    name: "Apex Africa News 24/7",
    category: "News",
    currentShow: "World Business & Financial Markets",
    nextShow: "Pan-African Evening News Bulletin",
    viewersCount: 1840,
    thumbnailUrl: "/brand/og-image.png",
    isLive: true,
  },
  {
    id: "sports-live",
    name: "Super League Football",
    category: "Sports",
    currentShow: "Champions Matchday Pre-Game Live",
    nextShow: "Lagos Cup Quarter Final Kickoff",
    viewersCount: 5120,
    thumbnailUrl: "/brand/og-image.png",
    isLive: true,
  },
  {
    id: "pulse-music",
    name: "Pulse Music Television",
    category: "Music",
    currentShow: "Top 20 Chart Countdown",
    nextShow: "Afrobeats Gold Legends",
    viewersCount: 960,
    thumbnailUrl: "/brand/og-image.png",
    isLive: true,
  },
  {
    id: "nollywood-cinema",
    name: "Nollywood Premiere Channel",
    category: "Movies",
    currentShow: "Lagos Nights (Blockbuster Premiere)",
    nextShow: "Royal Destiny Episode 12",
    viewersCount: 3290,
    thumbnailUrl: "/brand/og-image.png",
    isLive: true,
  },
];

function LiveTvPage() {
  const [channels, setChannels] = useState<LiveChannel[]>(mockChannels);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const categories = ["All", "Entertainment", "News", "Sports", "Music", "Movies"];

  const filteredChannels = channels.filter((ch) => {
    const matchesCategory = selectedCategory === "All" || ch.category === selectedCategory;
    const matchesSearch =
      ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ch.currentShow.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#030B2A] via-[#07143D] to-[#0A1A4A] text-white pb-24 md:pb-12">
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
                Continuous live satellite feeds and web broadcasts with instant electronic programme guides
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/channels/$channelId"
                params={{ channelId: "demo" }}
                className="flex items-center gap-2 rounded-2xl bg-cyan-400 px-5 py-2.5 text-xs font-bold text-[#030e28] shadow-md shadow-cyan-400/20 transition hover:brightness-110"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Quick Play Demo Channel</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Filter Categories */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                  selectedCategory === cat
                    ? "bg-cyan-400 text-[#030e28] shadow-md shadow-cyan-400/20"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

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

        {/* Channel Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredChannels.map((channel) => (
            <Link
              key={channel.id}
              to="/channels/$channelId"
              params={{ channelId: channel.id }}
              className="group block rounded-3xl border border-white/10 bg-[#07143D]/80 p-5 backdrop-blur-xl shadow-lg transition hover:border-cyan-400/50 hover:bg-[#0c1f54]"
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
                    <p className="font-bold text-white truncate text-[11px]">{channel.currentShow}</p>
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

              {/* Play Button */}
              <div className="mt-4 flex items-center justify-between text-xs font-bold text-cyan-400 group-hover:translate-x-1 transition">
                <span>Tune into Live Stream</span>
                <Play className="h-4 w-4 fill-current" />
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* Shared Viewer Bottom Navigation */}
      <ViewerBottomNav activeTab="live-tv" />
    </div>
  );
}
