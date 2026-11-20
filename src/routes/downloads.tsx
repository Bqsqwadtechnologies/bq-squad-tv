import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { ViewerBottomNav } from "@/components/ViewerBottomNav";
import { ProfileAccountHub } from "@/components/ProfileAccountHub";
import {
  Bell,
  CheckCircle2,
  CloudOff,
  Download,
  Film,
  HardDrive,
  Home,
  Info,
  Play,
  Search,
  Tv2,
  Wifi,
} from "lucide-react";

export const Route = createFileRoute("/downloads")({
  component: DownloadsPage,
  head: () => ({
    meta: [
      { title: "Downloads & Offline Viewing — BQ SQWAD TV" },
      {
        name: "description",
        content: "Offline downloads status and online streaming on BQ SQWAD TV.",
      },
    ],
  }),
});

function DownloadsPage() {
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
            <Link to="/library" className="transition hover:text-[#00D8F5]">
              Library
            </Link>
            <Link to="/downloads" className="text-[#00D8F5] transition hover:text-white">
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
      <main className="relative z-10 mx-auto max-w-3xl px-4 py-12 sm:px-8 text-center space-y-8">
        {/* Animated Icon Card */}
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500/20 via-blue-600/20 to-purple-600/10 shadow-2xl shadow-cyan-500/20">
          <Download className="h-10 w-10 text-cyan-400 animate-bounce" />
        </div>

        <div className="space-y-3">
          <span className="inline-block rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-xs font-bold uppercase tracking-wider text-cyan-300">
            Online Streaming Platform
          </span>
          <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white">
            Offline Downloads Coming Soon
          </h1>
          <p className="max-w-xl mx-auto text-sm sm:text-base text-slate-300 leading-relaxed">
            BQ SQWAD TV currently streams all high-definition movies, live broadcasts, and series directly
            from global edge distribution nodes. Encrypted offline downloads for Android and web will
            arrive in an upcoming release.
          </p>
        </div>

        {/* Feature Highlights Card */}
        <div className="rounded-3xl border border-white/10 bg-[#07143D]/80 p-6 sm:p-8 backdrop-blur-xl shadow-xl space-y-4 text-left">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Info className="h-4 w-4 text-cyan-400" />
            In the meantime, stream seamlessly:
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-[#030b2a] p-3.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-white">Zero Buffer Live TV</p>
                <p className="text-slate-400 text-[11px]">Sub-second edge latency on 4G and 5G connections</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-[#030b2a] p-3.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-white">Adaptive Bitrate (ABR)</p>
                <p className="text-slate-400 text-[11px]">Dynamic stream downscaling to save your cellular data</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap justify-center items-center gap-4 pt-4">
          <Link
            to="/live-tv"
            className="flex items-center gap-2 rounded-2xl bg-cyan-400 px-6 py-3 text-xs sm:text-sm font-bold text-[#030e28] shadow-lg shadow-cyan-400/25 transition hover:brightness-110"
          >
            <Tv2 className="h-4 w-4" />
            <span>Watch Live TV</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-xs sm:text-sm font-bold text-white transition hover:bg-white/10"
          >
            <Film className="h-4 w-4 text-cyan-300" />
            <span>Explore Catalog</span>
          </Link>
        </div>
      </main>

      {/* Shared Viewer Bottom Navigation */}
      <ViewerBottomNav activeTab="downloads" />
    </div>
  );
}
