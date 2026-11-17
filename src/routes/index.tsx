import { useEffect, useState } from "react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell, ChevronRight, CirclePlay, Clapperboard,
  Film, Grid2X2, Home, Search, Settings, ShieldCheck, Signal,
  Sparkles, Tv2, Smile, Play, MoreHorizontal, UserRound,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "BQ SQWAD TV — Watch. Stream. Enjoy." },
      { name: "description", content: "Discover live channels, movies, series and family entertainment on BQ SQWAD TV." },
      { property: "og:title", content: "BQ SQWAD TV — Watch. Stream. Enjoy." },
      { property: "og:description", content: "Live channels, movies and series in one connected viewing experience." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const quick = [
  { label: "Live TV", icon: Tv2, href: "#live-channels" },
  { label: "Movies", icon: Film, href: "#library" },
  { label: "Series", icon: Clapperboard, href: "#library" },
  { label: "Kids", icon: Smile, href: "#family" },
];

type FeaturedItem = { id: string; title: string; category: string; posterUrl: string | null; channelId: string };
type ChannelItem = { id: string; title: string; category: string; posterUrl: string | null; isLive: boolean; currentProgramme: string | null };

function HomePage() {
  const [activeNav, setActiveNav] = useState("Home");
  const [activeQuick, setActiveQuick] = useState("Live TV");
  const [notice, setNotice] = useState("");
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [featuredContent, setFeaturedContent] = useState<FeaturedItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "signed_out" | "error">("loading");
  const [walletCurrencySymbol, setWalletCurrencySymbol] = useState("$");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const publicConfigResponse = await fetch("/api/public/v1/config/client", { cache: "no-store" });
        if (publicConfigResponse.ok) {
          const publicConfig = await publicConfigResponse.json() as { currencySymbol?: string };
          if (active && typeof publicConfig.currencySymbol === "string") setWalletCurrencySymbol(publicConfig.currencySymbol);
        }
        const token = await restoreWebSession();
        if (!active) return;
        if (!token) { setCatalogState("signed_out"); return; }
        const walletResponse = await fetch("/api/public/v1/wallet/summary", {
          headers: await getWebAuthHeaders(token),
          cache: "no-store",
        });
        if (walletResponse.ok) {
          const wallet = await walletResponse.json() as { currencySymbol?: string };
          if (active && typeof wallet.currencySymbol === "string") setWalletCurrencySymbol(wallet.currencySymbol);
        }
        const response = await fetch("/api/public/v1/catalog/home", {
          headers: await getWebAuthHeaders(token),
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Catalogue unavailable");
        const data = await response.json() as { channels?: ChannelItem[]; featuredContent?: FeaturedItem[] };
        if (!active) return;
        setChannels(Array.isArray(data.channels) ? data.channels : []);
        setFeaturedContent(Array.isArray(data.featuredContent) ? data.featuredContent : []);
        setCatalogState("ready");
      } catch {
        if (active) setCatalogState("error");
      }
    })();
    return () => { active = false; };
  }, []);

  const nav = [
    { label: "Home", icon: Home, href: "#home" },
    { label: "Live TV", icon: Tv2, href: "#live-channels" },
    { label: "Library", icon: Grid2X2, href: "#library" },
    { label: "Settings", icon: Settings, href: "#settings" },
  ];

  return (
    <main id="home" className="min-h-screen overflow-hidden bg-white pb-24 text-slate-900 md:pb-8">
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-72 left-1/2 h-[42rem] w-[70rem] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[150px]" />
        <div className="absolute right-[-16rem] top-[30rem] h-[34rem] w-[34rem] rounded-full bg-cyan-400/10 blur-[130px]" />
      </div>

      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-3 pb-4 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:gap-5 sm:px-7 lg:px-10">
        <a href="#home" className="shrink-0" aria-label="BQ SQWAD TV home">
          <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="h-auto w-[120px] object-contain min-[400px]:w-[168px] sm:w-[205px]" />
        </a>
        <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 lg:flex">
          {nav.slice(0, 3).map(item => (
            <a key={item.label} href={item.href} onClick={() => setActiveNav(item.label)}
              className={activeNav === item.label ? "text-cyan-300" : "transition hover:text-blue-700"}>
              {item.label}
            </a>
          ))}
          <a href="#family" className="transition hover:text-blue-700">Kids & Family</a>
        </nav>
        <div className="relative flex shrink-0 items-center gap-1.5 sm:gap-3">
          <a href="/account" aria-label="Sign in or view account" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-cyan-200/50 bg-white text-blue-700 ring-2 ring-cyan-300/15">
            <UserRound size={21} aria-hidden="true" />
          </a>
          <a href="/wallet" aria-label="Wallet" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-blue-100 bg-blue-50 text-xs font-bold text-blue-700 transition hover:border-cyan-300/50">{walletCurrencySymbol}</a>
          <a href="#library" aria-label="Search" href="/search" className="hidden h-10 w-10 place-items-center rounded-full border border-blue-100 bg-white text-blue-700 transition hover:border-cyan-300/50 hover:text-cyan-200 min-[381px]:grid"><Search size={19} /></a>
          <button onClick={() => setNotice("Notifications will appear here when your account is connected.")} aria-label="Notifications" className="relative hidden h-10 w-10 place-items-center rounded-full border border-blue-100 bg-white text-blue-700 transition hover:border-cyan-300/50 min-[381px]:grid"><Bell size={18} /><span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-cyan-300" /></button>
          <button onClick={() => setHeaderMenuOpen(value => !value)} aria-label="More options" aria-expanded={headerMenuOpen} className="grid h-10 w-10 place-items-center rounded-full border border-blue-100 bg-white text-blue-700 min-[381px]:hidden"><MoreHorizontal size={20} /></button>
          {headerMenuOpen ? <div className="absolute right-0 top-12 z-50 grid min-w-40 gap-1 rounded-xl border border-blue-100 bg-white p-2 text-slate-800 shadow-xl min-[381px]:hidden">
            <a href="/search" onClick={() => setHeaderMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"><Search size={16} /> Search</a>
            <button onClick={() => { setHeaderMenuOpen(false); setNotice("Notifications will appear here when your account is connected."); }} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"><Bell size={16} /> Notifications</button>
          </div> : null}
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-7 lg:px-10">
        <section className="relative overflow-hidden rounded-[1.8rem] border border-blue-300/20 bg-gradient-to-br from-[#0a48b8] via-[#071c66] to-[#040b2b] shadow-[0_28px_90px_rgba(0,75,255,0.22)] sm:rounded-[2.2rem]">
          <div className="absolute -right-20 -top-28 h-96 w-96 rounded-full border-[36px] border-cyan-300/10" />
          <div className="absolute -bottom-40 right-1/4 h-96 w-96 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="relative grid min-h-[350px] items-center gap-8 p-6 sm:min-h-[420px] sm:p-10 lg:grid-cols-[1.05fr_.95fr] lg:p-14">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-cyan-100"><Sparkles size={13} /> BQ SQWAD TV preview</span>
              <h1 className="mt-6 text-4xl font-black leading-[1.03] tracking-tight sm:text-5xl lg:text-6xl">Premium entertainment<br /><span className="bg-gradient-to-r from-cyan-200 to-blue-100 bg-clip-text text-transparent">starts here.</span></h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-blue-50/75 sm:text-base">Live channels, movies, series and family entertainment — brought together in one viewing experience.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="#live-channels" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 text-sm font-extrabold text-[#031039] shadow-lg shadow-cyan-500/20 transition hover:brightness-110"><Play size={16} fill="currentColor" /> Explore channels</a>
                <a href="#library" className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-bold text-blue-800 transition hover:bg-blue-50"><CirclePlay size={17} /> Browse library</a>
              </div>
            </div>
            <div className="relative hidden min-h-[250px] items-center justify-center lg:flex">
              <div className="absolute h-64 w-64 rounded-full border border-cyan-200/20 shadow-[0_0_90px_rgba(34,211,238,0.15)]" />
              <div className="absolute h-48 w-48 rounded-full border border-blue-100/20" />
              <div className="relative flex h-44 w-72 -rotate-6 items-center justify-center rounded-[2rem] border border-cyan-100/30 bg-gradient-to-br from-blue-400/35 via-[#061b60] to-[#020824] shadow-2xl shadow-black/40">
                <div className="absolute inset-3 rounded-[1.4rem] border border-blue-100" />
                <div className="grid h-20 w-20 place-items-center rounded-3xl border border-cyan-100/50 bg-cyan-300/10 text-cyan-100 shadow-[0_0_35px_rgba(34,211,238,0.28)]"><Tv2 size={42} /></div>
                <span className="absolute bottom-5 text-xs font-black tracking-[0.22em] text-white">WATCH · STREAM · ENJOY</span>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 flex items-center justify-center gap-2" aria-label="Featured banner">
          {[0, 1, 2, 3].map(i => <span key={i} className={i === 0 ? "h-2 w-7 rounded-full bg-cyan-300" : "h-2 w-2 rounded-full bg-white/25"} />)}
        </div>

        <section className="mt-9 sm:mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-extrabold sm:text-xl">Quick access</h2>
            <a href="#library" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-200">See all <ChevronRight size={15} /></a>
          </div>
          <div className="grid grid-cols-4 gap-2.5 sm:gap-4">
            {quick.map(({ label, icon: Icon, href }) => (
              <a key={label} href={href} onClick={() => setActiveQuick(label)}
                className={activeQuick === label ? "group flex min-h-[104px] flex-col items-center justify-center gap-3 rounded-2xl border border-cyan-300/50 bg-gradient-to-b from-blue-600/80 to-[#071b59] text-cyan-100 shadow-[0_10px_35px_rgba(0,102,255,0.22)] transition sm:min-h-[125px]" : "group flex min-h-[104px] flex-col items-center justify-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-b from-white to-blue-50 text-slate-700 transition hover:border-cyan-300/40 sm:min-h-[125px]"}>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200 transition group-hover:scale-105"><Icon size={25} /></span>
                <span className="text-xs font-bold sm:text-sm">{label}</span>
              </a>
            ))}
          </div>
        </section>

        <section id="library" className="mt-10 sm:mt-14">
          <div className="mb-4 flex items-center justify-between">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Hand-picked for discovery</p><h2 className="mt-1 text-lg font-extrabold sm:text-xl">Trending now</h2></div>
            <a href="#library" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-200">See all <ChevronRight size={15} /></a>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {featuredContent.map(item => (
              <a key={item.id} href={"/content/" + encodeURIComponent(item.id)} aria-label={"View " + item.title} className="group block overflow-hidden rounded-2xl border border-blue-100 bg-white">
                <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-gradient-to-br from-blue-100 via-sky-100 to-slate-100">
                  {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : <Film size={48} className="text-blue-300" />}
                  <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-900/80 to-transparent px-3 pb-4 pt-12">
                    <span className="block text-sm font-black leading-tight sm:text-base">{item.title}</span>
                    <span className="mt-1 block text-[10px] font-semibold text-slate-700">{item.category}</span>
                  </span>
                </div>
              </a>
            ))}
            {catalogState === "loading" && <p className="col-span-full py-8 text-center text-sm text-slate-500">Loading featured content…</p>}
            {catalogState === "signed_out" && <p className="col-span-full py-8 text-center text-sm text-slate-500">Sign in to view the live catalogue and featured titles.</p>}
            {catalogState === "error" && <p className="col-span-full py-8 text-center text-sm text-slate-500">The catalogue is temporarily unavailable.</p>}
            {catalogState === "ready" && featuredContent.length === 0 && <p className="col-span-full py-8 text-center text-sm text-slate-500">No featured titles have been published yet.</p>}
          </div>
        </section>

        <section id="live-channels" className="mt-10 sm:mt-14">
          <div className="mb-4 flex items-center justify-between">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Find something live</p><h2 className="mt-1 text-lg font-extrabold sm:text-xl">All channels</h2></div>
            <a href="#live-channels" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-200">See all <ChevronRight size={15} /></a>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {channels.map(channel => (
              <article key={channel.id} className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-white to-blue-50 p-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg">
                  {channel.posterUrl ? <img src={channel.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Tv2 size={22} />}
                </span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{channel.title}</span><span className="mt-1 block text-[11px] text-slate-500">{channel.currentProgramme || channel.category}</span></span>
                <span className="flex items-center gap-1.5 text-cyan-200"><Signal size={17} /><span className="hidden text-[10px] font-bold uppercase sm:inline">{channel.isLive ? "Live" : "Channel"}</span></span>
              </article>
            ))}
            {catalogState === "ready" && channels.length === 0 && <p className="col-span-full py-6 text-center text-sm text-slate-500">No published channels are available yet.</p>}
          </div>
        </section>

        <section id="family" className="mt-10 grid gap-4 sm:mt-14 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-[#0a357f] to-[#06143c] p-6 sm:p-8">
            <div className="flex items-center gap-2 text-cyan-200"><ShieldCheck size={18} /><span className="text-xs font-bold uppercase tracking-[0.18em]">Viewer-first controls</span></div>
            <h2 className="mt-4 text-2xl font-black">Your viewing, with clarity.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100/65">Clear session pricing, account controls and content availability checks are part of the BQ SQWAD TV experience.</p>
          </div>
          
        </section>

        {notice && <div role="status" className="fixed bottom-24 left-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 rounded-2xl border border-cyan-200/30 bg-[#061a4d] px-5 py-4 text-sm text-white shadow-2xl shadow-black/50 md:bottom-6"><div className="flex items-start justify-between gap-4"><p>{notice}</p><button onClick={() => setNotice("")} className="text-cyan-200">Close</button></div></div>}

        <footer id="settings" className="mt-12 border-t border-blue-100 py-7 text-center text-xs text-slate-500">
          <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="mx-auto h-auto w-40 object-contain" />
          <p className="mt-2">© {new Date().getFullYear()} Bq Sqwad Technologies. All rights reserved.</p>
          <p className="mt-1">Content availability depends on distribution rights and your region.</p>
        </footer>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-blue-100 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl md:hidden" aria-label="Primary navigation">
        <div className="mx-auto flex max-w-xl items-center justify-around">
          {nav.map(({ label, icon: Icon, href }) => (
            <a key={label} href={href} onClick={() => setActiveNav(label)}
              className={activeNav === label ? "flex min-w-0 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-cyan-200" : "flex min-w-0 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-slate-500"}>
              <Icon size={19} /><span className="text-[10px] font-bold">{label}</span>
            </a>
          ))}
        </div>
      </nav>
    </main>
  );
}
