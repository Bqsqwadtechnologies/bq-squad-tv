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
import { restoreWebSession, getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "BQ SQWAD TV — Watch. Stream. Enjoy." },
      {
        name: "description",
        content: "Discover movies, series and family entertainment on BQ SQWAD TV.",
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
};

const quickTiles = [
  { label: "Movies", icon: Film, href: "/movies" },
  { label: "Series", icon: Clapperboard, href: "/series" },
  { label: "Library", icon: Tv2, href: "/library" },
  { label: "Kids", icon: Smile, href: "/movies?genre=Kids" },
];

function HomePage() {
  const navigate = useNavigate();
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [currencySymbol, setCurrencySymbol] = useState("₦");
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [balance, setBalance] = useState("0.00");
  const [watchTimeHours, setWatchTimeHours] = useState("0.0");
  const [rewardPoints, setRewardPoints] = useState("0");
  const [referralCount, setReferralCount] = useState(0);
  const [userReferralCode, setUserReferralCode] = useState<string>("BQS-TV-BONUS");

  // Content items loaded from catalog or real continue-watching storage
  const [continueWatchingItems, setContinueWatchingItems] = useState<ContentItem[]>([]);
  const [trendingItems, setTrendingItems] = useState<ContentItem[]>([]);
  const [forYouItems, setForYouItems] = useState<ContentItem[]>([]);
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
              if (typeof pData.rewardsBalance === "number") {
                setRewardPoints(String(pData.rewardsBalance));
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
            setTrendingItems(Array.isArray(data.trending) ? data.trending : []);
            if (Array.isArray(data.featuredContent)) {
              setForYouItems(data.featuredContent);
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
          text: "Stream movies and hit series on BQ SQWAD TV. Use my referral code to get started!",
          url: referralLink,
        })
        .catch(() => {});
    } else {
      handleCopyReferral();
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-24 md:pb-16">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
          <div className="flex items-center gap-8">
            <Link to="/" aria-label="BQ SQWAD TV home" className="flex items-center">
              <BrandLogo variant="horizontal" className="h-8 w-auto sm:h-9" />
            </Link>
            <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
              <Link to="/" className="text-blue-600 font-bold transition">
                Home
              </Link>
              <Link to="/movies" className="transition hover:text-blue-600">
                Movies
              </Link>
              <Link to="/series" className="transition hover:text-blue-600">
                Series
              </Link>
              <Link to="/library" className="transition hover:text-blue-600">
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
              aria-label="Search content"
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
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
            </Link>
            <ProfileAccountHub />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 pt-6 sm:px-8">
        {/* Welcome Banner Card */}
        <section className="relative overflow-hidden rounded-3xl border border-blue-200/50 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 p-6 sm:p-9 text-white shadow-lg">
          <div className="relative z-10 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-yellow-400/20 text-yellow-300">
                <Sparkles size={16} />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-yellow-300">
                Welcome to BQ SQWAD TV
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-black uppercase tracking-tight sm:text-4xl text-white">
              PREMIUM ENTERTAINMENT ON BQ SQWAD TV
            </h1>
            <p className="mt-2 text-sm text-blue-100 sm:text-base leading-relaxed">
              Keep watching and earn more rewards. Enjoy blockbuster movies, hit series and curated
              entertainment on your terms.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/movies"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-blue-700 shadow-md transition hover:bg-blue-50 active:scale-95"
              >
                <Play size={16} fill="currentColor" /> Start Watching
              </Link>
              <button
                type="button"
                onClick={() => setReferralModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95"
              >
                <Gift size={16} className="text-yellow-300" /> Refer Friends
              </button>
            </div>
          </div>

          {/* Decorative artwork background */}
          <div className="pointer-events-none absolute -bottom-10 right-0 h-64 w-64 opacity-25">
            <div className="h-full w-full rounded-full bg-gradient-to-br from-cyan-400 to-indigo-400 blur-3xl" />
          </div>
        </section>

        {/* 4 Light KPI Cards */}
        <section
          className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4"
          aria-label="Viewer Overview Metrics"
        >
          {/* Watch Time */}
          <Link
            to="/history"
            className="group relative overflow-hidden rounded-2xl border border-blue-100 bg-white p-4 sm:p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 sm:text-sm">
                Watch Time
              </span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <Play size={18} fill="currentColor" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-xl font-black tracking-tight sm:text-3xl tabular-nums text-slate-900">
                {watchTimeHours} hrs
              </span>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <span className="text-[11px] font-normal">Streaming time</span>
              </div>
            </div>
          </Link>

          {/* Balance */}
          <Link
            to="/wallet"
            className="group relative overflow-hidden rounded-2xl border border-purple-100 bg-white p-4 sm:p-5 shadow-sm transition hover:border-purple-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 sm:text-sm">
                Available Balance
              </span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-purple-50 text-purple-600">
                <Wallet size={18} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-xl font-black tracking-tight sm:text-3xl tabular-nums text-slate-900">
                {currencySymbol}
                {balance}
              </span>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <span className="text-[11px] font-normal">Wallet balance</span>
              </div>
            </div>
          </Link>

          {/* Rewards */}
          <div
            onClick={() => setReferralModalOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setReferralModalOpen(true);
            }}
            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 sm:text-sm">
                Rewards
              </span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                <Star size={18} fill="currentColor" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-xl font-black tracking-tight sm:text-3xl tabular-nums text-slate-900">
                {rewardPoints} pts
              </span>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <span className="text-[11px] font-normal">Reward points</span>
              </div>
            </div>
          </div>

          {/* Referrals */}
          <div
            onClick={() => setReferralModalOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setReferralModalOpen(true);
            }}
            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-amber-100 bg-white p-4 sm:p-5 shadow-sm transition hover:border-amber-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 sm:text-sm">
                Referrals
              </span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600">
                <Users size={18} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-xl font-black tracking-tight sm:text-3xl tabular-nums text-slate-900">
                {referralCount}
              </span>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <span className="text-[11px] font-normal">Friends referred</span>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Access Tiles */}
        <section className="mt-8 sm:mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 sm:text-sm">
              Quick Access
            </h2>
            <Link
              to="/library"
              className="text-xs font-bold text-blue-600 transition hover:underline"
            >
              See All &gt;
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3 sm:gap-5">
            {quickTiles.map(({ label, icon: Icon, href }) => (
              <Link
                key={label}
                to={href}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 text-center shadow-sm transition hover:border-blue-400 hover:bg-blue-50/40 active:scale-95"
              >
                <div className="grid h-12 w-12 sm:h-14 sm:w-14 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon size={24} />
                </div>
                <span className="text-xs font-bold text-slate-700 sm:text-sm">{label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Continue Watching Section */}
        {continueWatchingItems.length > 0 ? (
          <section className="mt-10 sm:mt-12">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold sm:text-xl text-slate-900">Continue Watching</h2>
              <Link
                to="/history"
                className="text-xs font-bold text-blue-600 transition hover:underline"
              >
                See All &gt;
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
              {continueWatchingItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm transition hover:border-blue-300"
                >
                  <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-slate-100 flex items-center justify-center">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-blue-600 text-white shadow">
                      <Play size={18} fill="currentColor" />
                    </div>
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-200">
                      <div
                        className="h-full bg-blue-600"
                        style={{ width: `${item.progressPercent ?? 50}%` }}
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-semibold text-blue-600">{item.duration}</span>
                    <h3 className="line-clamp-1 text-sm font-bold text-slate-900 sm:text-base">
                      {item.title}
                    </h3>
                    <p className="line-clamp-1 text-xs text-slate-500">{item.category}</p>
                    <Link
                      to="/channels/$channelId"
                      params={{ channelId: item.channelId ?? item.id }}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
                    >
                      <Play size={12} fill="currentColor" /> Resume
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Live Now Section */}
        <section className="mt-10 sm:mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold sm:text-xl text-slate-900 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
              Live Now
            </h2>
            <Link
              to="/live-tv"
              className="text-xs font-bold text-blue-600 transition hover:underline"
            >
              See All &gt;
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              to="/live-tv"
              className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:border-blue-400"
            >
              <div className="relative aspect-video w-28 shrink-0 rounded-xl bg-slate-900 overflow-hidden flex items-center justify-center">
                <span className="absolute top-1 left-1 rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">
                  Live
                </span>
                <Play size={16} className="text-white" fill="white" />
              </div>
              <div className="min-w-0">
                <h3 className="line-clamp-1 text-sm font-bold text-slate-900">Apex News 24/7</h3>
                <p className="line-clamp-1 text-xs text-slate-500">Live Global Broadcast</p>
              </div>
            </Link>
          </div>
        </section>

        {/* Trending Now Poster Row */}
        <section className="mt-10 sm:mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold sm:text-xl text-slate-900">Trending Now</h2>
            <Link
              to="/movies"
              className="text-xs font-bold text-blue-600 transition hover:underline"
            >
              See All &gt;
            </Link>
          </div>

          {trendingItems.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
              {trendingItems.map((item, idx) => (
                <Link
                  key={item.id}
                  to="/channels/$channelId"
                  params={{ channelId: item.channelId ?? item.id }}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-400 hover:shadow-md active:scale-95"
                >
                  <div className="relative aspect-[2/3] w-full bg-gradient-to-t from-slate-100 to-slate-200 flex items-end p-3">
                    <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-white font-black text-xs text-blue-700 shadow-sm border border-slate-200">
                      #{item.rank ?? idx + 1}
                    </span>
                    <div className="w-full">
                      <span className="rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-blue-700 shadow-sm border border-slate-200">
                        {currencySymbol}
                        {item.pricePerMinute ?? "0.25"}/min
                      </span>
                      <h3 className="mt-1.5 line-clamp-1 text-xs font-bold text-slate-900 group-hover:text-blue-600 sm:text-sm">
                        {item.title}
                      </h3>
                      <p className="text-[11px] text-slate-500">{item.category}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
              No trending titles yet. Watch content to see it rank here!
            </div>
          )}
        </section>

        {/* For You / Recommended Rail */}
        <section className="mt-10 sm:mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold sm:text-xl text-slate-900">For You</h2>
            <Link
              to="/series"
              className="text-xs font-bold text-blue-600 transition hover:underline"
            >
              See All &gt;
            </Link>
          </div>

          {forYouItems.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {forYouItems.map((item) => (
                <Link
                  key={item.id}
                  to="/channels/$channelId"
                  params={{ channelId: item.channelId ?? item.id }}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-400 active:scale-95"
                >
                  <div className="aspect-[4/3] w-full rounded-xl bg-blue-50 flex items-center justify-center">
                    <Film size={26} className="text-blue-500 group-hover:scale-110 transition" />
                  </div>
                  <div className="mt-2.5">
                    <h3 className="line-clamp-1 text-xs font-bold text-slate-900 group-hover:text-blue-600 sm:text-sm">
                      {item.title}
                    </h3>
                    <p className="line-clamp-1 text-[11px] text-slate-500">{item.category}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
              Explore channels and titles to build your personalized recommendations.
            </div>
          )}
        </section>

        {/* Activity and Refer Friends Dual Cards */}
        <section className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Your Activity Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-blue-600" />
                <h2 className="text-base font-bold sm:text-lg text-slate-900">Your Activity</h2>
              </div>
              <Link
                to="/history"
                className="text-xs font-bold text-blue-600 transition hover:underline"
              >
                See All &gt;
              </Link>
            </div>
            <div className="mt-4 divide-y divide-slate-100 space-y-3">
              {recentActivities.length > 0 ? (
                recentActivities.map((act) => (
                  <div key={act.id} className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
                        <Play size={14} fill="currentColor" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 sm:text-sm">{act.title}</p>
                        <p className="text-[11px] text-slate-500">{act.timestamp}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                      {act.points}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-slate-500">
                  <p>No recent activity recorded yet.</p>
                  <p className="mt-1 text-[11px] text-slate-400">Your viewing sessions and wallet transactions will appear here.</p>
                </div>
              )}
            </div>
          </div>

          {/* Refer Friends Card */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-5 sm:p-6 shadow-sm">
            <div className="relative z-10">
              <span className="inline-block rounded-full bg-amber-100 border border-amber-200 px-3 py-1 text-[11px] font-bold text-amber-800">
                Referral Program
              </span>
              <h2 className="mt-3 text-lg font-black text-slate-900 sm:text-xl">
                Refer Friends &amp; Earn Rewards
              </h2>
              <p className="mt-1 text-xs text-slate-600 sm:text-sm leading-relaxed">
                Share your referral link with family and friends. Earn 250 bonus points every time
                someone joins and watches.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReferralModalOpen(true)}
                  className="rounded-xl bg-amber-500 hover:bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95 sm:text-sm"
                >
                  Refer Now
                </button>
                <button
                  type="button"
                  onClick={handleCopyReferral}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:scale-95 sm:text-sm"
                >
                  {copiedLink ? (
                    <Check size={14} className="text-emerald-600" />
                  ) : (
                    <Copy size={14} />
                  )}
                  <span>{copiedLink ? "Copied" : "Copy Code"}</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Refer Friends Modal */}
      {referralModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setReferralModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
              <Gift size={28} />
            </div>
            <h3 className="mt-4 text-xl font-black text-slate-900">Refer Friends</h3>
            <p className="mt-1 text-xs text-slate-600">
              Give your friends access to premium entertainment and earn rewards together.
            </p>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Your Referral Code
              </label>
              <div className="mt-1 text-2xl font-black tracking-widest text-blue-600">
                {referralCode}
              </div>
              <p className="mt-2 text-[11px] text-slate-500 truncate">{referralLink}</p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleCopyReferral}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-3 text-xs font-bold text-slate-700 hover:bg-slate-100 active:scale-95"
              >
                {copiedLink ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                <span>{copiedLink ? "Link Copied!" : "Copy Link"}</span>
              </button>
              <button
                type="button"
                onClick={handleShareReferral}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-95"
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
