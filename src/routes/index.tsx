import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import {
  Bell, ChevronRight, Clapperboard, Download, Film,
  Grid2X2, Home, Search, Settings, Smile, Tv2, UserRound,
  Play, RotateCw, X
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "BQ SQWAD TV — Watch. Stream. Enjoy." },
      { name: "description", content: "Discover live channels, movies, series and family entertainment on BQ SQWAD TV." },
      { property: "og:title", content: "BQ SQWAD TV — Watch. Stream. Enjoy." },
      { property: "og:description", content: "Premium entertainment without limits on BQ SQWAD TV." },
      { property: "og:image", content: "/brand/og-image.png" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const quickTiles = [
  { label: "Live TV", icon: Tv2, href: "/channels/demo" },
  { label: "Movies", icon: Film, href: "/movies" },
  { label: "Series", icon: Clapperboard, href: "/series" },
  { label: "Kids", icon: Smile, href: "/movies?genre=Kids" },
];

type FeaturedItem = {
  id: string;
  title: string;
  category: string;
  posterUrl: string | null;
  channelId?: string;
  pricePerMinute?: string;
};

type ChannelItem = {
  id: string;
  title: string;
  category: string;
  posterUrl: string | null;
  isLive: boolean;
  currentProgramme: string | null;
  pricePerMinute?: string;
};

function HomePage() {
  const [activeNav, setActiveNav] = useState("Home");
  const [featuredContent, setFeaturedContent] = useState<FeaturedItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [currencySymbol, setCurrencySymbol] = useState("₦");
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [downloadsOpen, setDownloadsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      try {
        setCatalogState("loading");
        const configRes = await fetch("/api/public/v1/config/client", { cache: "no-store" });
        if (configRes.ok) {
          const cfg = (await configRes.json()) as { currencySymbol?: string };
          if (active && cfg.currencySymbol) {
            setCurrencySymbol(cfg.currencySymbol);
          }
        }

        const res = await fetch("/api/public/v1/catalog/home", { cache: "no-store" });
        if (!res.ok) throw new Error("Catalog fetch failed");
        const data = (await res.json()) as {
          channels?: ChannelItem[];
          featuredContent?: FeaturedItem[];
        };
        if (!active) return;
        setChannels(Array.isArray(data.channels) ? data.channels : []);
        setFeaturedContent(Array.isArray(data.featuredContent) ? data.featuredContent : []);
        setCatalogState("ready");
      } catch {
        if (active) setCatalogState("error");
      }
    }
    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

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
            <Link to="/" className="text-[#00D8F5] transition hover:text-white">Home</Link>
            <Link to="/channels/demo" className="transition hover:text-[#00D8F5]">Live TV</Link>
            <Link to="/movies" className="transition hover:text-[#00D8F5]">Movies</Link>
            <Link to="/series" className="transition hover:text-[#00D8F5]">Series</Link>
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
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#FF405A] ring-2 ring-[#07143D]" />
          </Link>
          <Link
            to="/account"
            aria-label="Profile"
            className="grid h-10 w-10 place-items-center rounded-full border border-[#00D8F5]/40 bg-gradient-to-tr from-[#0052D4] to-[#00D8F5] text-white shadow-sm transition hover:scale-105"
          >
            <UserRound size={18} />
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-8">
        {/* Hero Banner Card */}
        <section className="relative mt-4 overflow-hidden rounded-[20px] sm:rounded-[24px] border border-cyan-400/20 bg-gradient-to-r from-[#0052D4] via-[#0A2568] to-[#030B2A] p-6 sm:p-10 shadow-xl">
          <div className="max-w-xl">
            <span className="inline-block rounded-full bg-[#00D8F5]/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#00D8F5]">
              Featured on BQ SQWAD TV
            </span>
            <h1 className="mt-4 text-2xl font-black uppercase tracking-tight sm:text-4xl">
              PREMIUM ENTERTAINMENT ON BQ SQWAD TV
            </h1>
            <p className="mt-3 text-sm text-slate-300 sm:text-base">
              Watch live channels, blockbuster movies and hit series on your terms. Pay only for the minutes you watch.
            </p>
            <div className="mt-6 flex items-center gap-4">
              <Link
                to="/channels/demo"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#00D8F5] to-[#0052D4] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#0052D4]/40 transition hover:brightness-110"
              >
                <Play size={16} fill="currentColor" /> Watch Now
              </Link>
            </div>
          </div>

          {/* Banner Page Dots */}
          <div className="mt-8 flex items-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveBannerIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-2 transition-all rounded-full ${
                  activeBannerIndex === i ? "w-6 bg-[#00D8F5]" : "w-2 bg-white/30"
                }`}
              />
            ))}
          </div>
        </section>

        {/* Quick Access Tiles */}
        <section className="mt-8 sm:mt-12">
          <h2 className="text-base font-bold uppercase tracking-wider text-slate-400">Quick Access</h2>
          <div className="mt-4 grid grid-cols-4 gap-3 sm:gap-5">
            {quickTiles.map(({ label, icon: Icon, href }) => (
              <Link
                key={label}
                to={href}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#0C1738]/80 p-3 sm:p-4 text-center backdrop-blur-sm transition hover:border-[#00D8F5]/50 hover:bg-[#122252]"
              >
                <div className="grid h-12 w-12 sm:h-14 sm:w-14 place-items-center rounded-xl bg-gradient-to-br from-[#0052D4]/30 to-[#00D8F5]/20 text-[#00D8F5] shadow-inner">
                  <Icon size={24} />
                </div>
                <span className="text-xs font-semibold text-slate-200 sm:text-sm">{label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Trending Now Poster Row */}
        <section className="mt-10 sm:mt-14">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold sm:text-xl">Trending Now</h2>
            <Link to="/movies" className="text-xs font-bold text-[#00D8F5] transition hover:underline">
              See All
            </Link>
          </div>

          {catalogState === "loading" ? (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-white/5" />
              ))}
            </div>
          ) : catalogState === "error" ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-[#0C1738] p-6 text-center">
              <p className="text-sm text-slate-400">Unable to load trending titles right now.</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#0052D4] px-4 py-2 text-xs font-semibold text-white"
              >
                <RotateCw size={14} /> Try again
              </button>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {(featuredContent.length > 0 ? featuredContent : [
                { id: "1", title: "Midnight Echoes", category: "Movies", posterUrl: null, pricePerMinute: "0.25" },
                { id: "2", title: "Lagos Nights", category: "Series", posterUrl: null, pricePerMinute: "0.30" },
                { id: "3", title: "Chasing Tomorrow", category: "Movies", posterUrl: null, pricePerMinute: "0.20" },
                { id: "4", title: "Squad Champions", category: "Live TV", posterUrl: null, pricePerMinute: "0.40" },
              ]).map((item) => (
                <Link
                  key={item.id}
                  to={item.category === "Live TV" ? "/channels/demo" : `/content/${item.id}`}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0C1738] transition hover:border-[#00D8F5]/40 hover:shadow-lg hover:shadow-[#0052D4]/20"
                >
                  <div className="aspect-[2/3] w-full bg-gradient-to-t from-[#030B2A] to-[#142456] flex items-end p-3">
                    <div className="w-full">
                      <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-[#00D8F5]">
                        {currencySymbol}{item.pricePerMinute ?? "0.25"}/min
                      </span>
                      <h3 className="mt-1 line-clamp-1 text-xs font-bold text-white group-hover:text-[#00D8F5]">
                        {item.title}
                      </h3>
                      <p className="text-[11px] text-slate-400">{item.category}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Downloads "Coming Soon" Modal */}
      {downloadsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-3xl border border-cyan-400/30 bg-[#0C1738] p-6 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setDownloadsOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#00D8F5]/15 text-[#00D8F5]">
              <Download size={28} />
            </div>
            <h3 className="mt-4 text-xl font-bold">Downloads</h3>
            <span className="mt-1 inline-block rounded-full bg-[#0052D4]/30 px-3 py-1 text-xs font-semibold text-[#00D8F5]">
              Coming soon
            </span>
            <p className="mt-3 text-sm text-slate-300">
              Viewing stays online only. Offline downloads will be available in a future update without additional charge.
            </p>
            <button
              type="button"
              onClick={() => setDownloadsOpen(false)}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#0052D4] to-[#00D8F5] py-2.5 text-sm font-bold text-white"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {/* Bottom Navigation Bar for Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-white/10 bg-[#070E24]/90 py-2 backdrop-blur-lg md:hidden">
        <Link
          to="/"
          onClick={() => setActiveNav("Home")}
          className={`flex flex-col items-center gap-1 text-[11px] font-semibold ${
            activeNav === "Home" ? "text-[#00D8F5] drop-shadow-[0_0_8px_rgba(0,216,245,0.6)]" : "text-slate-400"
          }`}
        >
          <Home size={20} />
          <span>Home</span>
        </Link>
        <Link
          to="/channels/demo"
          onClick={() => setActiveNav("Live TV")}
          className={`flex flex-col items-center gap-1 text-[11px] font-semibold ${
            activeNav === "Live TV" ? "text-[#00D8F5] drop-shadow-[0_0_8px_rgba(0,216,245,0.6)]" : "text-slate-400"
          }`}
        >
          <Tv2 size={20} />
          <span>Live TV</span>
        </Link>
        <Link
          to="/movies"
          onClick={() => setActiveNav("Library")}
          className={`flex flex-col items-center gap-1 text-[11px] font-semibold ${
            activeNav === "Library" ? "text-[#00D8F5] drop-shadow-[0_0_8px_rgba(0,216,245,0.6)]" : "text-slate-400"
          }`}
        >
          <Grid2X2 size={20} />
          <span>Library</span>
        </Link>
        <button
          type="button"
          onClick={() => setDownloadsOpen(true)}
          className="flex flex-col items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-[#00D8F5]"
        >
          <Download size={20} />
          <span>Downloads</span>
        </button>
        <Link
          to="/account"
          onClick={() => setActiveNav("Settings")}
          className={`flex flex-col items-center gap-1 text-[11px] font-semibold ${
            activeNav === "Settings" ? "text-[#00D8F5] drop-shadow-[0_0_8px_rgba(0,216,245,0.6)]" : "text-slate-400"
          }`}
        >
          <Settings size={20} />
          <span>Settings</span>
        </Link>
      </nav>
    </div>
  );
}
