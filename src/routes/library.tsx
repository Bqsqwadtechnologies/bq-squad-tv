import { useState, useEffect } from "react";
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
  Play,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
  head: () => ({
    meta: [
      { title: "My Library — BQ SQWAD TV" },
      {
        name: "description",
        content: "Access your watchlist, continue watching queue, and saved titles on BQ SQWAD TV.",
      },
    ],
  }),
});

type LibraryItem = {
  id: string;
  title: string;
  genre: string;
  type: "movie" | "series";
  posterUrl: string;
  progressPercent?: number;
  duration?: string;
  isPurchased?: boolean;
  addedAt: string;
};

const STORAGE_KEY = "bq_viewer_library";

function LibraryPage() {
  const [activeTab, setActiveTab] = useState<"watchlist" | "continue" | "purchases" | "liked">(
    "watchlist",
  );
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [genreFilter, setGenreFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "title" | "progress">("recent");
  const [items, setItems] = useState<LibraryItem[]>([]);

  // Load from local storage or initialize empty
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setItems(JSON.parse(stored));
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }
  }, []);

  function saveItems(updated: LibraryItem[]) {
    setItems(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }

  function removeItem(id: string) {
    const next = items.filter((item) => item.id !== id);
    saveItems(next);
  }

  const genres = ["all", "Action", "Drama", "Comedy", "Sci-Fi", "Romance", "Kids"];

  const filteredItems = items
    .filter((item) => {
      // Tab matching
      if (activeTab === "watchlist") return !item.progressPercent && !item.isPurchased;
      if (activeTab === "continue")
        return item.progressPercent !== undefined && item.progressPercent > 0;
      if (activeTab === "purchases") return Boolean(item.isPurchased);
      if (activeTab === "liked") return false;
      return true;
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
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-24 md:pb-12">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
          <div className="flex items-center gap-8">
            <Link to="/" aria-label="BQ SQWAD TV home" className="flex items-center">
              <BrandLogo variant="horizontal" className="h-8 w-auto sm:h-9" />
            </Link>
            <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
              <Link to="/" className="transition hover:text-blue-600">
                Home
              </Link>
              <Link to="/movies" className="transition hover:text-blue-600">
                Movies
              </Link>
              <Link to="/series" className="transition hover:text-blue-600">
                Series
              </Link>
              <Link to="/library" className="text-blue-600 font-bold transition">
                Library
              </Link>
              <Link to="/downloads" className="transition hover:text-blue-600">
                Downloads
              </Link>
              <Link to="/settings" className="transition hover:text-blue-600">
                Settings
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/search"
              aria-label="Search"
              className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 hover:text-blue-600"
            >
              <Search size={18} />
            </Link>
            <Link
              to="/notifications"
              aria-label="Notifications"
              className="relative grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 hover:text-blue-600"
            >
              <Bell size={18} />
            </Link>
            <ProfileAccountHub />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
              <FolderHeart className="h-7 w-7 text-blue-600" />
              My Entertainment Library
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
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
                      ? "bg-blue-600 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50"
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
            className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
          >
            <Download size={15} />
            <span>Downloads (Offline Viewer)</span>
          </Link>
        </div>

        {/* Filter Controls: Type, Genre & Sort */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            {/* Type Filters */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] uppercase font-bold text-slate-500">Type:</span>
              {["all", "movie", "series"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={`rounded-xl px-2.5 py-1 text-xs font-semibold capitalize transition ${
                    typeFilter === type
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Genre Filters */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] uppercase font-bold text-slate-500">Genre:</span>
              <div className="flex flex-wrap gap-1">
                {genres.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGenreFilter(g)}
                    className={`rounded-xl px-2.5 py-1 text-xs font-semibold capitalize transition ${
                      genreFilter === g
                        ? "bg-slate-200 text-slate-900"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
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
            <span className="text-[11px] uppercase font-bold text-slate-500">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "recent" | "title" | "progress")}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
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
            className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm space-y-4"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              {activeTab === "watchlist" && <Bookmark className="h-8 w-8 text-slate-500" />}
              {activeTab === "continue" && <Clock className="h-8 w-8 text-slate-500" />}
              {activeTab === "purchases" && <ShoppingBag className="h-8 w-8 text-slate-500" />}
              {activeTab === "liked" && <ThumbsUp className="h-8 w-8 text-slate-500" />}
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {activeTab === "watchlist" && "Your watchlist is empty"}
              {activeTab === "continue" && "No unfinished videos"}
              {activeTab === "purchases" && "No purchased titles yet"}
              {activeTab === "liked" && "No liked content yet"}
            </h3>
            <p className="max-w-sm mx-auto text-xs text-slate-500 leading-relaxed">
              {activeTab === "watchlist" &&
                "Explore our catalogue of movies and series, and bookmark titles to build your watchlist."}
              {activeTab === "continue" &&
                "Titles you start watching will automatically appear here so you can pick up right where you left off."}
              {activeTab === "purchases" &&
                "Titles you purchase or rent will be permanently available here for unlimited on-demand streaming."}
              {activeTab === "liked" &&
                "Titles you give a thumbs-up will appear here for easy access."}
            </p>
            <Link
              to="/movies"
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <Film className="h-4 w-4" />
              <span>Browse Movies</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="group relative rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-400 hover:shadow-md"
              >
                {/* Poster & Play Action */}
                <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-100">
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-70" />

                  <Link
                    to="/content/$assetId"
                    params={{ assetId: item.id }}
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/30"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg">
                      <Play className="h-5 w-5 fill-current ml-0.5" />
                    </div>
                  </Link>

                  {/* Progress bar for continue watching */}
                  {item.progressPercent !== undefined && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-200">
                      <div
                        className="h-full bg-blue-600"
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove ${item.title}`}
                    className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition hover:bg-rose-600"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Details */}
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-blue-600">
                    <span>{item.genre}</span>
                    <span className="text-slate-400">{item.type}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 line-clamp-1 group-hover:text-blue-600 transition">
                    {item.title}
                  </h4>
                  {item.progressPercent !== undefined && (
                    <p className="text-[11px] text-slate-500 font-medium">
                      {item.progressPercent}% watched
                    </p>
                  )}
                  {item.isPurchased && (
                    <span className="inline-block rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200 uppercase">
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
