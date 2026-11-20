import { useEffect, useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { ViewerBottomNav } from "@/components/ViewerBottomNav";
import { ProfileAccountHub } from "@/components/ProfileAccountHub";
import {
  Bell,
  Check,
  ChevronRight,
  Clapperboard,
  Clock,
  Copy,
  CreditCard,
  Film,
  Gift,
  Play,
  Radio,
  RotateCw,
  Search,
  Share2,
  Smile,
  Sparkles,
  Star,
  Tv2,
  Users,
  Wallet,
  X,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "BQ SQWAD TV — Watch. Stream. Enjoy." },
      {
        name: "description",
        content: "Discover live channels, movies, series and family entertainment on BQ SQWAD TV.",
      },
      { property: "og:title", content: "BQ SQWAD TV — Watch. Stream. Enjoy." },
      {
        property: "og:description",
        content: "Premium entertainment without limits on BQ SQWAD TV.",
      },
      { property: "og:image", content: "/brand/og-image.png" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type ContentItem = {
  id: string;
  title: string;
  category: string;
  posterUrl: string | null;
  channelId?: string;
  pricePerMinute?: string;
  rank?: number;
  duration?: string;
  progressPercent?: number;
  viewerCount?: string;
  isLive?: boolean;
};

const quickTiles = [
  { label: "Live TV", icon: Tv2, href: "/live-tv" },
  { label: "Movies", icon: Film, href: "/movies" },
  { label: "Series", icon: Clapperboard, href: "/series" },
  { label: "Kids", icon: Smile, href: "/movies?genre=Kids" },
];

function HomePage() {
  const navigate = useNavigate();
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [currencySymbol, setCurrencySymbol] = useState("₦");
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [balance, setBalance] = useState("0.00");
  const [watchTimeHours, setWatchTimeHours] = useState("0.0");
  const [rewardPoints, setRewardPoints] = useState("0");
  const [referralCount, setReferralCount] = useState(0);
  const [userReferralCode, setUserReferralCode] = useState<string>("BQS-TV-BONUS");

  // Content items loaded from catalog or real continue-watching storage
  const [continueWatchingItems, setContinueWatchingItems] = useState<ContentItem[]>([]);

  const [trendingItems, setTrendingItems] = useState<ContentItem[]>([
    {
      id: "tr-1",
      title: "The Chosen One",
      category: "Movies",
      posterUrl: null,
      rank: 1,
      pricePerMinute: "0.25",
    },
    {
      id: "tr-2",
      title: "Love & Life",
      category: "Drama",
      posterUrl: null,
      rank: 2,
      pricePerMinute: "0.20",
    },
    {
      id: "tr-3",
      title: "Action 24/7",
      category: "Action",
      posterUrl: null,
      rank: 3,
      pricePerMinute: "0.30",
    },
    {
      id: "tr-4",
      title: "Empire Bloodlines",
      category: "Series",
      posterUrl: null,
      rank: 4,
      pricePerMinute: "0.35",
    },
  ]);

  const [liveNowItems, setLiveNowItems] = useState<ContentItem[]>([
    {
      id: "live-1",
      title: "BQ Sports TV",
      category: "Live Sports",
      posterUrl: null,
      channelId: "bq-sports",
      isLive: true,
      viewerCount: "18.4K",
    },
    {
      id: "live-2",
      title: "BQ News 24",
      category: "Breaking News",
      posterUrl: null,
      channelId: "bq-news",
      isLive: true,
      viewerCount: "12.1K",
    },
    {
      id: "live-3",
      title: "BQ Movies Plus",
      category: "Cinema Live",
      posterUrl: null,
      channelId: "bq-movies",
      isLive: true,
      viewerCount: "9.8K",
    },
    {
      id: "live-4",
      title: "BQ Kids Live",
      category: "Animation & Kids",
      posterUrl: null,
      channelId: "bq-kids",
      isLive: true,
      viewerCount: "6.3K",
    },
  ]);

  const [forYouItems, setForYouItems] = useState<ContentItem[]>([
    {
      id: "fy-1",
      title: "The Hunter",
      category: "Thriller",
      posterUrl: null,
      pricePerMinute: "0.25",
    },
    {
      id: "fy-2",
      title: "Power Play: Season 2",
      category: "Series",
      posterUrl: null,
      pricePerMinute: "0.30",
    },
    {
      id: "fy-3",
      title: "Love Forever",
      category: "Romance",
      posterUrl: null,
      pricePerMinute: "0.20",
    },
    {
      id: "fy-4",
      title: "Family First",
      category: "Comedy",
      posterUrl: null,
      pricePerMinute: "0.25",
    },
  ]);

  const [recentActivities, setRecentActivities] = useState<
    Array<{ id: string; title: string; timestamp: string; points: string }>
  >([]);

  const referralCode = userReferralCode;
  const referralLink = `https://bqsqwad.tv/register?ref=${referralCode}`;

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      try {
        setCatalogState("loading");

        // Load saved library / continue watching from localStorage
        try {
          const stored = localStorage.getItem("bq_viewer_library");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              setContinueWatchingItems(
                parsed
                  .filter((p: any) => (p.progressPercent ?? 0) > 0)
                  .map((p: any) => ({
                    id: p.id,
                    title: p.title,
                    category: p.genre || "Media",
                    posterUrl: p.posterUrl,
                    channelId: p.channelId,
                    progressPercent: p.progressPercent,
                    duration: p.duration,
                  }))
              );
            }
          }
        } catch {}

        const configRes = await fetch("/api/public/v1/config/client", { cache: "no-store" });
        if (configRes.ok) {
          const cfg = (await configRes.json()) as { currencySymbol?: string };
          if (active && cfg.currencySymbol) {
            setCurrencySymbol(cfg.currencySymbol);
          }
        }

        // Authenticated user metrics
        try {
          const session = await restoreWebSession();
          if (session) {
            const headers = await getWebAuthHeaders(session);
            const [walletRes, historyRes, profileRes] = await Promise.all([
              fetch("/api/public/v1/wallet", { headers, cache: "no-store" }),
              fetch("/api/public/v1/wallet/watch-history?limit=10", { headers, cache: "no-store" }),
              fetch("/api/public/v1/profile", { headers, cache: "no-store" }),
            ]);

            if (active && walletRes.ok) {
              const wData = await walletRes.json();
              if (typeof wData.balanceMinor === "number") {
                setBalance((wData.balanceMinor / 100).toFixed(2));
              }
              if (wData.symbol) setCurrencySymbol(wData.symbol);
            }

            if (active && historyRes.ok) {
              const hData = await historyRes.json();
              if (Array.isArray(hData.items) && hData.items.length > 0) {
                const totalSeconds = hData.items.reduce(
                  (acc: number, item: any) => acc + (item.durationSeconds || 0),
                  0
                );
                setWatchTimeHours((totalSeconds / 3600).toFixed(1));
                setRecentActivities(
                  hData.items.slice(0, 5).map((item: any) => ({
                    id: item.id,
                    title: item.description || "Viewing session",
                    timestamp: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "Recent",
                    points: item.formattedAmount || `-${item.amountMinor / 100}`,
                  }))
                );
              }
            }

            if (active && profileRes.ok) {
              const pData = await profileRes.json();
              if (pData.referralCode) {
                setUserReferralCode(pData.referralCode);
              }
              if (typeof pData.referralCount === "number") {
                setReferralCount(pData.referralCount);
              }
            }
          }
        } catch {}

        const res = await fetch("/api/public/v1/catalog/home", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (active && data) {
            if (Array.isArray(data.trending) && data.trending.length > 0) {
              setTrendingItems(data.trending);
            }
            if (Array.isArray(data.liveNow) && data.liveNow.length > 0) {
              setLiveNowItems(data.liveNow);
            }
          }
        }
        if (active) setCatalogState("ready");
      } catch {
        if (active) setCatalogState("ready");
      }
    }
    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  function handleCopyReferral() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(referralLink).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      });
    }
  }

  function handleShareReferral() {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator
        .share({
          title: "Join BQ SQWAD TV",
          text: "Stream movies, live channels and hit series on BQ SQWAD TV. Use my referral code to get started!",
          url: referralLink,
        })
        .catch(() => {});
    } else {
      handleCopyReferral();
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#030B2A] via-[#07143D] to-[#0A1A4A] text-white pb-24 md:pb-16">
      {/* Ambient background glows */}
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-72 left-1/2 h-[42rem] w-[64rem] -translate-x-1/2 rounded-full bg-[#0052D4]/20 blur-[150px]" />
        <div className="absolute right-[-10rem] top-[24rem] h-[32rem] w-[32rem] rounded-full bg-[#00D8F5]/10 blur-[140px]" />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-30 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-8">
        <div className="flex items-center gap-8">
          <Link to="/" aria-label="BQ SQWAD TV home" className="flex items-center">
            <BrandLogo variant="horizontal" className="h-8 w-auto sm:h-9" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-300 md:flex">
            <Link to="/" className="text-[#00D8F5] font-semibold transition hover:text-white">
              Home
            </Link>
            <Link to="/live-tv" className="transition hover:text-[#00D8F5]">
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
            aria-label="Search content"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20 hover:text-[#00D8F5]"
          >
            <Search size={18} />
          </Link>
          <Link
            to="/notifications"
            aria-label="Notifications"
            className="relative grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20 hover:text-[#00D8F5]"
          >
            <Bell size={18} />
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#FF405A] ring-2 ring-[#07143D]" />
          </Link>
          <ProfileAccountHub />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-8">
        {/* Welcome Banner Card (Reflective of Viewer Dashboard Style) */}
        <section className="relative mt-3 overflow-hidden rounded-[24px] border border-cyan-400/25 bg-gradient-to-r from-[#0052D4] via-[#0A2568] to-[#1A0B36] p-6 sm:p-9 shadow-2xl">
          <div className="relative z-10 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-yellow-400/20 text-yellow-300">
                <Sparkles size={16} />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-yellow-300">
                Welcome to BQ SQWAD TV
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-black uppercase tracking-tight sm:text-4xl">
              PREMIUM ENTERTAINMENT ON BQ SQWAD TV
            </h1>
            <p className="mt-2 text-sm text-slate-200 sm:text-base">
              Keep watching and earn more rewards. Enjoy blockbuster movies, hit series and live
              streams on your terms.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/live-tv"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#00D8F5] to-[#0052D4] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#0052D4]/40 transition hover:brightness-110 active:scale-95"
              >
                <Play size={16} fill="currentColor" /> Start Watching
              </Link>
              <button
                type="button"
                onClick={() => setReferralModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95"
              >
                <Gift size={16} className="text-yellow-300" /> Refer Friends
              </button>
            </div>
          </div>

          {/* Decorative artwork background */}
          <div className="pointer-events-none absolute -bottom-10 right-0 h-64 w-64 opacity-30 sm:opacity-50">
            <div className="h-full w-full rounded-full bg-gradient-to-br from-cyan-400 to-indigo-600 blur-2xl" />
          </div>
        </section>

        {/* 4 Gradient KPI Cards */}
        <section
          className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4"
          aria-label="Viewer Overview Metrics"
        >
          {/* Watch Time (Blue Gradient) */}
          <Link
            to="/history"
            className="group relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-[#0052D4] to-[#081B4B] p-4 sm:p-5 shadow-lg transition hover:scale-[1.02] hover:border-cyan-400/60"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-200 sm:text-sm">
                Watch Time
              </span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-[#00D8F5] backdrop-blur-sm">
                <Play size={18} fill="currentColor" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-xl font-black tracking-tight sm:text-3xl tabular-nums">
                {watchTimeHours} hrs
              </span>
              <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-400">
                <span>↑ +20%</span>
                <span className="text-slate-300 text-[11px] font-normal">this month</span>
              </div>
            </div>
          </Link>

          {/* Balance (Purple Gradient) */}
          <Link
            to="/wallet"
            className="group relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-br from-[#7928CA] to-[#250946] p-4 sm:p-5 shadow-lg transition hover:scale-[1.02] hover:border-purple-400/60"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-200 sm:text-sm">
                Available Balance
              </span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-purple-200 backdrop-blur-sm">
                <Wallet size={18} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-xl font-black tracking-tight sm:text-3xl tabular-nums">
                {currencySymbol}
                {balance}
              </span>
              <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-400">
                <span>↑ +25%</span>
                <span className="text-slate-300 text-[11px] font-normal">wallet</span>
              </div>
            </div>
          </Link>

          {/* Rewards (Teal/Green Gradient) */}
          <div
            onClick={() => setReferralModalOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setReferralModalOpen(true);
            }}
            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[#059669] to-[#04281E] p-4 sm:p-5 shadow-lg transition hover:scale-[1.02] hover:border-emerald-400/60"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-200 sm:text-sm">
                Rewards
              </span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-emerald-300 backdrop-blur-sm">
                <Star size={18} fill="currentColor" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-xl font-black tracking-tight sm:text-3xl tabular-nums">
                {rewardPoints} pts
              </span>
              <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-300">
                <span>↑ +30%</span>
                <span className="text-slate-300 text-[11px] font-normal">earned</span>
              </div>
            </div>
          </div>

          {/* Referrals (Gold/Amber Gradient) */}
          <div
            onClick={() => setReferralModalOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setReferralModalOpen(true);
            }}
            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-[#D97706] to-[#451A03] p-4 sm:p-5 shadow-lg transition hover:scale-[1.02] hover:border-amber-400/60"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-200 sm:text-sm">
                Referrals
              </span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-amber-300 backdrop-blur-sm">
                <Users size={18} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-xl font-black tracking-tight sm:text-3xl tabular-nums">
                {referralCount}
              </span>
              <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-400">
                <span>↑ +12%</span>
                <span className="text-slate-300 text-[11px] font-normal">active</span>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Access Tiles */}
        <section className="mt-8 sm:mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 sm:text-base">
              Quick Access
            </h2>
            <Link
              to="/library"
              className="text-xs font-bold text-[#00D8F5] transition hover:underline"
            >
              See All &gt;
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3 sm:gap-5">
            {quickTiles.map(({ label, icon: Icon, href }) => (
              <Link
                key={label}
                to={href}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#0C1738]/80 p-3 sm:p-4 text-center backdrop-blur-sm transition hover:border-[#00D8F5]/50 hover:bg-[#122252] active:scale-95"
              >
                <div className="grid h-12 w-12 sm:h-14 sm:w-14 place-items-center rounded-xl bg-gradient-to-br from-[#0052D4]/40 to-[#00D8F5]/20 text-[#00D8F5] shadow-inner">
                  <Icon size={24} />
                </div>
                <span className="text-xs font-semibold text-slate-200 sm:text-sm">{label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Continue Watching Section */}
        {continueWatchingItems.length > 0 ? (
          <section className="mt-10 sm:mt-12">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold sm:text-xl">Continue Watching</h2>
              <Link
                to="/history"
                className="text-xs font-bold text-[#00D8F5] transition hover:underline"
              >
                See All &gt;
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
              {continueWatchingItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#0C1738] p-3 sm:p-4 transition hover:border-[#00D8F5]/40"
                >
                  <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-[#142456] flex items-center justify-center">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-[#00D8F5]/80 text-black shadow">
                      <Play size={18} fill="currentColor" />
                    </div>
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60">
                      <div
                        className="h-full bg-[#00D8F5]"
                        style={{ width: `${item.progressPercent ?? 50}%` }}
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-semibold text-cyan-400">{item.duration}</span>
                    <h3 className="line-clamp-1 text-sm font-bold text-white sm:text-base">
                      {item.title}
                    </h3>
                    <p className="line-clamp-1 text-xs text-slate-400">{item.category}</p>
                    <Link
                      to="/channels/$channelId"
                      params={{ channelId: item.channelId ?? "demo" }}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#00D8F5] hover:underline"
                    >
                      <Play size={12} fill="currentColor" /> Resume
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Live Now Rail with Viewer Counts */}
        <section className="mt-10 sm:mt-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" />
              </span>
              <h2 className="text-lg font-bold sm:text-xl">Live Now</h2>
            </div>
            <Link
              to="/live-tv"
              className="text-xs font-bold text-[#00D8F5] transition hover:underline"
            >
              See All &gt;
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {liveNowItems.map((ch) => (
              <Link
                key={ch.id}
                to="/channels/$channelId"
                params={{ channelId: ch.channelId ?? "demo" }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0C1738] p-3 transition hover:border-[#00D8F5]/50 hover:shadow-lg hover:shadow-[#0052D4]/20 active:scale-95"
              >
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-gradient-to-br from-[#0052D4]/40 to-[#030B2A] flex items-center justify-center">
                  <Radio
                    size={28}
                    className="text-[#00D8F5] opacity-75 group-hover:scale-110 transition"
                  />
                  <span className="absolute left-2 top-2 rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow">
                    ● LIVE
                  </span>
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                    {ch.viewerCount}
                  </span>
                </div>
                <div className="mt-2.5">
                  <h3 className="line-clamp-1 text-xs font-bold text-white group-hover:text-[#00D8F5] sm:text-sm">
                    {ch.title}
                  </h3>
                  <p className="line-clamp-1 text-[11px] text-slate-400">{ch.category}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Trending Now Poster Row */}
        <section className="mt-10 sm:mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold sm:text-xl">Trending Now</h2>
            <Link
              to="/movies"
              className="text-xs font-bold text-[#00D8F5] transition hover:underline"
            >
              See All &gt;
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
            {trendingItems.map((item, idx) => (
              <Link
                key={item.id}
                to="/channels/$channelId"
                params={{ channelId: "demo" }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0C1738] transition hover:border-[#00D8F5]/40 hover:shadow-lg hover:shadow-[#0052D4]/20 active:scale-95"
              >
                <div className="relative aspect-[2/3] w-full bg-gradient-to-t from-[#030B2A] via-[#0D1D45] to-[#142456] flex items-end p-3">
                  <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-black/70 font-black text-xs text-[#00D8F5] shadow border border-cyan-400/30">
                    #{item.rank ?? idx + 1}
                  </span>
                  <div className="w-full">
                    <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-[#00D8F5]">
                      {currencySymbol}
                      {item.pricePerMinute ?? "0.25"}/min
                    </span>
                    <h3 className="mt-1 line-clamp-1 text-xs font-bold text-white group-hover:text-[#00D8F5] sm:text-sm">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-slate-400">{item.category}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* For You / Recommended Rail */}
        <section className="mt-10 sm:mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold sm:text-xl">For You</h2>
            <Link
              to="/series"
              className="text-xs font-bold text-[#00D8F5] transition hover:underline"
            >
              See All &gt;
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {forYouItems.map((item) => (
              <Link
                key={item.id}
                to="/channels/$channelId"
                params={{ channelId: "demo" }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0C1738] p-3 transition hover:border-[#00D8F5]/40 hover:shadow-lg active:scale-95"
              >
                <div className="aspect-[4/3] w-full rounded-xl bg-gradient-to-br from-[#0052D4]/30 to-[#030B2A] flex items-center justify-center">
                  <Film size={26} className="text-[#00D8F5]/60 group-hover:scale-110 transition" />
                </div>
                <div className="mt-2.5">
                  <h3 className="line-clamp-1 text-xs font-bold text-white group-hover:text-[#00D8F5] sm:text-sm">
                    {item.title}
                  </h3>
                  <p className="line-clamp-1 text-[11px] text-slate-400">{item.category}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Activity and Refer Friends Dual Cards (Directly matching dashboard style) */}
        <section className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Your Activity Card */}
          <div className="rounded-2xl border border-white/10 bg-[#0C1738]/90 p-5 sm:p-6 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-[#00D8F5]" />
                <h2 className="text-base font-bold sm:text-lg">Your Activity</h2>
              </div>
              <Link
                to="/history"
                className="text-xs font-bold text-[#00D8F5] transition hover:underline"
              >
                See All &gt;
              </Link>
            </div>
            <div className="mt-4 divide-y divide-white/5 space-y-3">
              {recentActivities.length > 0 ? (
                recentActivities.map((act) => (
                  <div key={act.id} className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#0052D4]/30 text-[#00D8F5]">
                        <Play size={14} fill="currentColor" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white sm:text-sm">{act.title}</p>
                        <p className="text-[11px] text-slate-400">{act.timestamp}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-400">
                      {act.points}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  <p>No recent activity recorded yet.</p>
                  <p className="mt-1 text-[11px] text-slate-500">Your viewing sessions and wallet transactions will appear here.</p>
                </div>
              )}
            </div>
          </div>

          {/* Refer Friends Card */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-[#1B1204] via-[#0C1738] to-[#030B2A] p-5 sm:p-6 shadow-xl">
            <div className="relative z-10">
              <span className="inline-block rounded-full bg-amber-400/20 px-3 py-1 text-[11px] font-bold text-amber-300">
                Referral Program
              </span>
              <h2 className="mt-3 text-lg font-black text-white sm:text-xl">
                Refer Friends &amp; Earn Rewards
              </h2>
              <p className="mt-1 text-xs text-slate-300 sm:text-sm">
                Share your referral link with family and friends. Earn 250 bonus points every time
                someone joins and watches.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReferralModalOpen(true)}
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-2.5 text-xs font-bold text-black shadow-lg shadow-amber-500/20 transition hover:brightness-110 active:scale-95 sm:text-sm"
                >
                  Refer Now
                </button>
                <button
                  type="button"
                  onClick={handleCopyReferral}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-sm hover:bg-white/20 active:scale-95 sm:text-sm"
                >
                  {copiedLink ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : (
                    <Copy size={14} />
                  )}
                  <span>{copiedLink ? "Copied" : "Copy Code"}</span>
                </button>
              </div>
            </div>
            {/* Background art glow */}
            <div className="pointer-events-none absolute -bottom-8 -right-8 h-40 w-40 rounded-full bg-amber-500/15 blur-2xl" />
          </div>
        </section>
      </main>

      {/* Refer Friends Modal */}
      {referralModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-3xl border border-amber-400/30 bg-[#0C1738] p-6 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setReferralModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/20 text-amber-300">
              <Gift size={28} />
            </div>
            <h3 className="mt-4 text-xl font-black">Refer Friends</h3>
            <p className="mt-1 text-xs text-slate-300">
              Give your friends access to premium entertainment and earn rewards together.
            </p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-4">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Your Referral Code
              </label>
              <div className="mt-1 text-2xl font-black tracking-widest text-[#00D8F5]">
                {referralCode}
              </div>
              <p className="mt-2 text-[11px] text-slate-400 truncate">{referralLink}</p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleCopyReferral}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 py-3 text-xs font-bold text-white hover:bg-white/20 active:scale-95"
              >
                {copiedLink ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                <span>{copiedLink ? "Link Copied!" : "Copy Link"}</span>
              </button>
              <button
                type="button"
                onClick={handleShareReferral}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00D8F5] to-[#0052D4] py-3 text-xs font-bold text-white shadow-lg active:scale-95"
              >
                <Share2 size={16} />
                <span>Share</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Shared Mobile Bottom Navigation */}
      <ViewerBottomNav activeTab="home" />
    </div>
  );
}
