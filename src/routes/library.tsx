import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { ViewerBottomNav } from "@/components/ViewerBottomNav";
import { ProfileAccountHub } from "@/components/ProfileAccountHub";
import {
  Bell,
  Bookmark,
  Clock,
  Download,
  Film,
  FolderHeart,
  History,
  Play,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
  head: () => ({
    meta: [
      { title: "My Library — BQ SQWAD TV" },
      {
        name: "description",
        content: "View your saved watchlist, purchase history, and continue watching titles on BQ SQWAD TV.",
      },
    ],
  }),
});

type LibraryItem = {
  id: string;
  title: string;
  type: "movie" | "series" | "live";
  genre: string;
  posterUrl: string;
  progressPercent?: number;
  addedAt: string;
};

const sampleWatchlist: LibraryItem[] = [
  {
    id: "mov_lagos_nights",
    title: "Lagos Nights: Shadows of Victoria Island",
    type: "movie",
    genre: "Thriller",
    posterUrl: "/brand/og-image.png",
    progressPercent: 45,
    addedAt: "2026-03-28",
  },
  {
    id: "ser_abidjan_hustle",
    title: "Abidjan Hustle Season 1",
    type: "series",
    genre: "Drama",
    posterUrl: "/brand/og-image.png",
    progressPercent: 80,
    addedAt: "2026-03-25",
  },
  {
    id: "mov_golden_savannah",
    title: "Golden Savannah Documentary",
    type: "movie",
    genre: "Documentary",
    posterUrl: "/brand/og-image.png",
    addedAt: "2026-03-20",
  },
];

function LibraryPage() {
  const [activeTab, setActiveTab] = useState<"watchlist" | "continue" | "purchases" | "downloads">("watchlist");
  const [items, setItems] = useState<LibraryItem[]>(sampleWatchlist);
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");

  const filteredItems = items.filter((item) => {
    if (activeTab === "continue") return (item.progressPercent ?? 0) > 0;
    if (activeTab === "purchases") return true;
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    return true;
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
            <Link to="/live-tv" className="transition hover:text-[#00D8F5]">
              Live TV
            </Link>
            <Link to="/library" className="text-[#00D8F5] transition hover:text-white">
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
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <FolderHeart className="h-7 w-7 text-cyan-400" />
              My Entertainment Library
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Manage your personal watchlist, resume video playback, and view purchased titles
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: "watchlist", label: "Watchlist", icon: Bookmark },
            { id: "continue", label: "Continue Watching", icon: Clock },
            { id: "purchases", label: "My Purchases", icon: ShoppingBag },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold transition ${
                  active
                    ? "bg-cyan-400 text-[#030e28] shadow-md shadow-cyan-400/20"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:text-white"
                }`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}

          <Link
            to="/downloads"
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-400 hover:text-cyan-300 transition"
          >
            <Download size={15} />
            <span>Downloads (Offline)</span>
          </Link>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase font-bold text-slate-400">Type:</span>
            {["all", "movie", "series"].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                className={`rounded-xl px-3 py-1 text-xs font-medium capitalize transition ${
                  typeFilter === type
                    ? "bg-white/20 text-white font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase font-bold text-slate-400">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-1 text-xs text-white focus:outline-none"
            >
              <option value="recent">Recently Added</option>
              <option value="title">Alphabetical (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Items Grid or Empty State */}
        {filteredItems.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#07143D]/60 p-12 text-center backdrop-blur-xl shadow-xl space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
              <FolderHeart className="h-8 w-8 text-slate-500" />
            </div>
            <h3 className="text-base font-bold text-white">No titles in your library yet</h3>
            <p className="max-w-sm mx-auto text-xs text-slate-400 leading-relaxed">
              Explore our catalogue of live channels, movies, and TV series, and bookmark titles to build
              your watchlist.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-2xl bg-cyan-400 px-6 py-2.5 text-xs font-bold text-[#030e28] shadow-md shadow-cyan-400/20 hover:brightness-110"
            >
              <Film className="h-4 w-4" />
              <span>Browse Catalog</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="group relative rounded-3xl border border-white/10 bg-[#07143D]/80 p-4 backdrop-blur-xl shadow-lg transition hover:border-cyan-400/50 hover:bg-[#0c1f54]"
              >
                <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[#030b2a]">
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
                  <Link
                    to="/content/$assetId"
                    params={{ assetId: item.id }}
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-400 text-[#030e28] shadow-xl">
                      <Play className="h-5 w-5 fill-current ml-0.5" />
                    </div>
                  </Link>
                  {item.progressPercent !== undefined && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
                      <div
                        className="h-full bg-cyan-400"
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    <span>{item.genre}</span>
                    <span className="text-slate-400">{item.type}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white line-clamp-1 group-hover:text-cyan-300 transition">
                    {item.title}
                  </h4>
                  {item.progressPercent !== undefined && (
                    <p className="text-[11px] text-slate-400">
                      {item.progressPercent}% watched
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Shared Viewer Bottom Navigation */}
      <ViewerBottomNav activeTab="library" />
    </div>
  );
}
