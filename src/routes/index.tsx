import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell, Cast, ChevronRight, CirclePlay, Clapperboard, Download,
  Film, Grid2X2, Home, Search, Settings, ShieldCheck, Signal,
  Sparkles, Tv2, Wallet, Smile, Play,
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

const titles = [
  { title: "The Chosen One", kind: "Featured premiere", tone: "from-blue-800 via-indigo-900 to-slate-950", icon: "✦" },
  { title: "Love & Life", kind: "Drama", tone: "from-fuchsia-800 via-rose-950 to-slate-950", icon: "♡" },
  { title: "Action 24/7", kind: "Action", tone: "from-cyan-800 via-blue-950 to-slate-950", icon: "⚡" },
  { title: "Family First", kind: "Family", tone: "from-amber-700 via-orange-950 to-slate-950", icon: "✺" },
];

const channels = [
  { name: "BQ Sports TV", category: "Sports · Live", color: "from-blue-500 to-cyan-400", symbol: "BQ" },
  { name: "BQ News 24", category: "News · Live", color: "from-rose-500 to-red-600", symbol: "NEWS" },
  { name: "BQ Movies", category: "Movies · Live", color: "from-indigo-500 to-blue-600", symbol: "FILM" },
  { name: "BQ Kids", category: "Kids · Live", color: "from-amber-400 to-orange-500", symbol: "☺" },
];

function HomePage() {
  const [activeNav, setActiveNav] = useState("Home");
  const [activeQuick, setActiveQuick] = useState("Live TV");
  const [notice, setNotice] = useState("");

  const nav = [
    { label: "Home", icon: Home, href: "#home" },
    { label: "Live TV", icon: Tv2, href: "#live-channels" },
    { label: "Library", icon: Grid2X2, href: "#library" },
    { label: "Downloads", icon: Download, href: "#downloads" },
    { label: "Settings", icon: Settings, href: "#settings" },
  ];

  return (
    <main id="home" className="min-h-screen overflow-hidden bg-[#030b2a] pb-24 text-white md:pb-8">
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-72 left-1/2 h-[42rem] w-[70rem] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[150px]" />
        <div className="absolute right-[-16rem] top-[30rem] h-[34rem] w-[34rem] rounded-full bg-cyan-400/10 blur-[130px]" />
      </div>

      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between gap-5 px-4 py-5 sm:px-7 lg:px-10">
        <a href="#home" className="shrink-0" aria-label="BQ SQWAD TV home">
          <img src="/brand/bq-sqwad-tv-logo.svg" alt="BQ SQWAD TV" className="h-auto w-[168px] object-contain sm:w-[205px]" />
        </a>
        <nav className="hidden items-center gap-8 text-sm font-semibold text-white/65 lg:flex">
          {nav.slice(0, 3).map(item => (
            <a key={item.label} href={item.href} onClick={() => setActiveNav(item.label)}
              className={activeNav === item.label ? "text-cyan-300" : "transition hover:text-white"}>
              {item.label}
            </a>
          ))}
          <a href="#family" className="transition hover:text-white">Kids & Family</a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <a href="#library" aria-label="Search" className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/80 transition hover:border-cyan-300/50 hover:text-cyan-200"><Search size={19} /></a>
          <button onClick={() => setNotice("Notifications will appear here when your account is connected.")} aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/80 transition hover:border-cyan-300/50"><Bell size={18} /><span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-cyan-300" /></button>
          <a href="#profile" aria-label="Profile" className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-cyan-300 to-blue-600 text-sm font-black text-[#031039]">BQ</a>
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
                <a href="#library" className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[0.06] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"><CirclePlay size={17} /> Browse library</a>
              </div>
            </div>
            <div className="relative hidden min-h-[250px] items-center justify-center lg:flex">
              <div className="absolute h-64 w-64 rounded-full border border-cyan-200/20 shadow-[0_0_90px_rgba(34,211,238,0.15)]" />
              <div className="absolute h-48 w-48 rounded-full border border-blue-100/20" />
              <div className="relative flex h-44 w-72 -rotate-6 items-center justify-center rounded-[2rem] border border-cyan-100/30 bg-gradient-to-br from-blue-400/35 via-[#061b60] to-[#020824] shadow-2xl shadow-black/40">
                <div className="absolute inset-3 rounded-[1.4rem] border border-white/10" />
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
                className={activeQuick === label ? "group flex min-h-[104px] flex-col items-center justify-center gap-3 rounded-2xl border border-cyan-300/50 bg-gradient-to-b from-blue-600/80 to-[#071b59] text-cyan-100 shadow-[0_10px_35px_rgba(0,102,255,0.22)] transition sm:min-h-[125px]" : "group flex min-h-[104px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-b from-[#0c2465] to-[#06133d] text-white/80 transition hover:border-cyan-300/40 sm:min-h-[125px]"}>
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
            {titles.map((item, index) => (
              <button key={item.title} onClick={() => setNotice(item.title + " is a design preview. Content will appear after catalog publishing.")}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-[#07143d] text-left transition hover:-translate-y-1 hover:border-cyan-300/40">
                <div className={`relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-gradient-to-br ${item.tone}`}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.16),transparent_45%)]" />
                  <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/20 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white/75">Preview</div>
                  <span className="relative text-6xl font-black text-white/30 transition group-hover:scale-110">{item.icon}</span>
                  <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#020824] via-[#020824]/75 to-transparent px-3 pb-4 pt-12">
                    <span className="block text-sm font-black leading-tight sm:text-base">{item.title}</span>
                    <span className="mt-1 block text-[10px] font-semibold text-white/55">{item.kind}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section id="live-channels" className="mt-10 sm:mt-14">
          <div className="mb-4 flex items-center justify-between">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Find something live</p><h2 className="mt-1 text-lg font-extrabold sm:text-xl">All channels</h2></div>
            <a href="#live-channels" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-200">See all <ChevronRight size={15} /></a>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {channels.map((channel, index) => (
              <button key={channel.name} onClick={() => setNotice(channel.name + " will be available when the channel and its licensed stream are published.")}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-[#0b1e58] to-[#07143d] p-3 text-left transition hover:border-cyan-300/40">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${channel.color} text-[10px] font-black text-white shadow-lg`}>{channel.symbol}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{channel.name}</span><span className="mt-1 block text-[11px] text-white/50">{channel.category}</span></span>
                <span className="flex items-center gap-1.5 text-cyan-200"><Signal size={17} /><span className="hidden text-[10px] font-bold uppercase sm:inline">Preview</span></span>
              </button>
            ))}
          </div>
        </section>

        <section id="family" className="mt-10 grid gap-4 sm:mt-14 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-[#0a357f] to-[#06143c] p-6 sm:p-8">
            <div className="flex items-center gap-2 text-cyan-200"><ShieldCheck size={18} /><span className="text-xs font-bold uppercase tracking-[0.18em]">Viewer-first controls</span></div>
            <h2 className="mt-4 text-2xl font-black">Your viewing, with clarity.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100/65">Clear session pricing, account controls and content availability checks are part of the BQ SQWAD TV experience.</p>
          </div>
          <div id="downloads" className="rounded-3xl border border-white/10 bg-[#07143d] p-6 sm:p-8">
            <div className="flex items-center gap-2 text-cyan-200"><Download size={18} /><span className="text-xs font-bold uppercase tracking-[0.18em]">Your library</span></div>
            <h2 className="mt-4 text-xl font-black">Downloads & watchlist</h2>
            <p className="mt-3 text-sm leading-6 text-white/50">Your saved programmes and downloads will appear here after you sign in.</p>
          </div>
        </section>

        {notice && <div role="status" className="fixed bottom-24 left-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 rounded-2xl border border-cyan-200/30 bg-[#061a4d] px-5 py-4 text-sm text-white shadow-2xl shadow-black/50 md:bottom-6"><div className="flex items-start justify-between gap-4"><p>{notice}</p><button onClick={() => setNotice("")} className="text-cyan-200">Close</button></div></div>}

        <footer id="settings" className="mt-12 border-t border-white/10 py-7 text-center text-xs text-white/35">
          <span className="font-extrabold tracking-[0.18em] text-white/65">BQ SQWAD TV</span>
          <p className="mt-2">© {new Date().getFullYear()} Bq Sqwad Technologies. All rights reserved.</p>
          <p className="mt-1">Content availability depends on distribution rights and your region.</p>
        </footer>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-cyan-300/15 bg-[#030b2a]/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl md:hidden" aria-label="Primary navigation">
        <div className="mx-auto flex max-w-xl items-center justify-around">
          {nav.map(({ label, icon: Icon, href }) => (
            <a key={label} href={href} onClick={() => setActiveNav(label)}
              className={activeNav === label ? "flex min-w-0 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-cyan-200" : "flex min-w-0 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-white/55"}>
              <Icon size={19} /><span className="text-[10px] font-bold">{label}</span>
            </a>
          ))}
        </div>
      </nav>
    </main>
  );
}
