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
  ThumbsUp,
  X,
} from "lucide-react";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
  head: () => ({
    meta: [
      { title: "My Library — BQ SQWAD TV" },
      {
        name: "description",
        content:
          "View your saved watchlist, purchase history, and continue watching titles on BQ SQWAD TV.",
      },
    ],
  }),
});

export type LibraryItem = {
  id: string;
  title: string;
  type: "movie" | "series" | "live";
  genre: string;
  posterUrl: string;
  progressPercent?: number;
  addedAt: string;
  isPurchased?: boolean;
};

const defaultItems: LibraryItem[] = [
  {
    id: "mov_lagos_nights",
    title: "Lagos Nights: Shadows of Victoria Island",
    type: "movie",
    genre: "Thriller",
    posterUrl: "/brand/og-image.png",
    progressPercent: 45,
    addedAt: "2026-03-28",
    isPurchased: true,
  },
  {
    id: "ser_abidjan_hustle",
    title: "Abidjan Hustle Season 1",
    type: "series",
    genre: "Drama",
    posterUrl: "/brand/og-image.png",
    progressPercent: 80,
    addedAt: "2026-03-25",
    isPurchased: false,
  },
  {
    id: "mov_golden_savannah",
    title: "Golden Savannah Documentary",
    type: "movie",
    genre: "Documentary",
    posterUrl: "/brand/og-image.png",
    addedAt: "2026-03-20",
    isPurchased: true,
  },
  {
    id: "mov_super_eagles_triumph",
    title: "Super Eagles: African Kings",
    type: "movie",
    genre: "Sports",
    posterUrl: "/brand/og-image.png",
    progressPercent: 20,
    addedAt: "2026-03-15",
    isPurchased: false,
  },
];

function LibraryPage() {
  const [activeTab, setActiveTab] = useState<"watchlist" | "continue" | "purchases" | "liked">("watchlist");
  const [likedItems, setLikedItems] = useState<LibraryItem[]>([]);
  const [items, setItems] = useState<LibraryItem[]>(defaultItems);
  const [typeFilter, setTypeFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"recent" | "title" | "progress">("recent");


  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/public/v1/user/library/liked");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setLikedItems(data.map((item: any) => ({
              id: item.targetId || item.id,
              title: item.title,
              type: (item.targetType === "channel" || item.targetType === "live_stream") ? "live" : "movie",
              genre: "Liked",
              posterUrl: item.posterUrl || "/brand/og-image.png",
              addedAt: item.likedAt || new Date().toISOString(),
            })));
          }
        }
      } catch {
        // Silently ignore
      }
    })();
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("bq_viewer_library");
      if (stored) {
        setItems(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage error
    }
  }, []);

  const saveItems = (newItems: LibraryItem[]) => {
    setItems(newItems);
    try {
      localStorage.setItem("bq_viewer_library", JSON.stringify(newItems));
    } catch {
      // Ignore storage error
    }
  };

  const removeItem = (id: string) => {
    const updated = items.filter((item) => item.id !== id);
    saveItems(updated);
  };

  const genres = ["all", "Thriller", "Drama", "Documentary", "Sports"];

  const baseList = activeTab === "liked" ? (likedItems.length ? likedItems : defaultItems.slice(0, 2)) : items;
  const filteredItems = baseList
    .filter((item) => {
      if (activeTab === "continue") {
        return (item.progressPercent ?? 0) > 0;
      }
      if (activeTab === "purchases") {
        return item.isPurchased === true;
      }
      return true; // watchlist shows all saved items
    })
    .filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (genreFilter !== "all" && item.genre.toLowerCase() !== genreFilter.toLowerCase())
        return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "progress") return (b.progressPercent ?? 0) - (a.progressPercent ?? 0);
      return b.addedAt.localeCompare(a.addedAt);
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

        {/* Tab Navigation & Downloads Placeholder Link */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "watchlist", label: "Watchlist", icon: Bookmark },
              { id: "continue", label: "Continue Watching", icon: Clock },
              { id: "purchases", label: "My Purchases", icon: ShoppingBag },
              { id: "liked", label: "Liked", icon: ThumbsUp },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as "watchlist" | "continue" | "purchases" | "liked")}
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
          </div>

          <Link
            to="/downloads"
            className="flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-400/20 transition"
          >
            <Download size={15} />
            <span>Downloads (Offline Viewer)</span>
          </Link>
        </div>

        {/* Filter Controls: Type, Genre & Sort */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/5 bg-[#07143D]/50 p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Type Filters */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] uppercase font-bold text-slate-400">Type:</span>
              {["all", "movie", "series"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={`rounded-xl px-2.5 py-1 text-xs font-medium capitalize transition ${
                    typeFilter === type
                      ? "bg-cyan-400 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Genre Filters */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] uppercase font-bold text-slate-400">Genre:</span>
              <div className="flex flex-wrap gap-1">
                {genres.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGenreFilter(g)}
                    className={`rounded-xl px-2.5 py-1 text-xs font-medium capitalize transition ${
                      genreFilter === g
                        ? "bg-white/20 text-white font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase font-bold text-slate-400">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "recent" | "title" | "progress")}
              className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="recent">Recently Added</option>
              <option value="title">Alphabetical (A-Z)</option>
              <option value="progress">Viewing Progress</option>
            </select>
          </div>
        </div>

        {/* Items Grid or Designed Empty State */}
        {filteredItems.length === 0 ? (
          <div
            data-testid="empty-library-state"
            className="rounded-3xl border border-white/10 bg-[#07143D]/60 p-12 text-center backdrop-blur-xl shadow-xl space-y-4"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
              {activeTab === "watchlist" && <Bookmark className="h-8 w-8 text-slate-500" />}
              {activeTab === "continue" && <Clock className="h-8 w-8 text-slate-500" />}
              {activeTab === "purchases" && <ShoppingBag className="h-8 w-8 text-slate-500" />}
            </div>
            <h3 className="text-base font-bold text-white">
              {activeTab === "watchlist" && "Your watchlist is empty"}
              {activeTab === "continue" && "No unfinished videos"}
              {activeTab === "purchases" && "No purchased titles yet"}
            </h3>
            <p className="max-w-sm mx-auto text-xs text-slate-400 leading-relaxed">
              {activeTab === "watchlist" &&
                "Explore our catalogue of live channels, movies, and TV series, and bookmark titles to build your watchlist."}
              {activeTab === "continue" &&
                "Titles you start watching will automatically appear here so you can pick up right where you left off."}
              {activeTab === "purchases" &&
                "Titles you purchase or rent will be permanently available here for unlimited on-demand streaming."}
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
                {/* Poster & Play Action */}
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

                  {/* Progress bar for continue watching */}
                  {item.progressPercent !== undefined && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
                      <div
                        className="h-full bg-cyan-400 shadow-[0_0_8px_rgba(0,216,245,0.8)]"
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove ${item.title}`}
                    className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-slate-300 opacity-0 group-hover:opacity-100 transition hover:bg-rose-600 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Details */}
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    <span>{item.genre}</span>
                    <span className="text-slate-400">{item.type}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white line-clamp-1 group-hover:text-cyan-300 transition">
                    {item.title}
                  </h4>
                  {item.progressPercent !== undefined && (
                    <p className="text-[11px] text-slate-400 font-medium">
                      {item.progressPercent}% watched
                    </p>
                  )}
                  {item.isPurchased && (
                    <span className="inline-block rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 uppercase">
                      Purchased
                    </span>
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
