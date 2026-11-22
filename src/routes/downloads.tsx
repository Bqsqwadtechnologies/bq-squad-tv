import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { ViewerBottomNav } from "@/components/ViewerBottomNav";
import { ProfileAccountHub } from "@/components/ProfileAccountHub";
import {
  Bell,
  Clapperboard,
  Download,
  Film,
  HardDrive,
  Info,
  Search,
  WifiOff,
} from "lucide-react";

export const Route = createFileRoute("/downloads")({
  component: DownloadsPage,
  head: () => ({
    meta: [
      { title: "Downloads & Offline Viewing — BQ SQWAD TV" },
      {
        name: "description",
        content: "Offline downloads status and movie streaming on BQ SQWAD TV.",
      },
    ],
  }),
});

function DownloadsPage() {
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
              <Link to="/downloads" className="text-blue-600 font-bold transition">
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
      <main className="relative z-10 mx-auto max-w-3xl px-4 py-12 sm:px-8 text-center space-y-8">
        {/* Animated Icon Card */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-blue-200 bg-blue-50 text-blue-600 shadow-sm">
          <Download className="h-9 w-9" />
        </div>

        <div className="space-y-3">
          <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-4 py-1 text-xs font-bold uppercase tracking-wider text-blue-700">
            Offline Library
          </span>
          <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-slate-900">
            Downloads &amp; Offline Viewing
          </h1>
          <p className="max-w-xl mx-auto text-sm sm:text-base text-slate-600 leading-relaxed">
            Download your favorite titles to watch seamlessly on supported devices when traveling or without an internet connection.
          </p>
        </div>

        {/* Empty State Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-12 shadow-sm space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <WifiOff className="h-7 w-7 text-slate-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No Downloads Yet</h3>
          <p className="max-w-md mx-auto text-xs sm:text-sm text-slate-500 leading-relaxed">
            You haven't downloaded any movies or series yet. When you download content, it will appear here ready for instant playback.
          </p>

          <div className="pt-4 flex flex-wrap justify-center items-center gap-3">
            <Link
              to="/movies"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Film className="h-4 w-4" />
              <span>Explore Movies</span>
            </Link>
            <Link
              to="/series"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              <Clapperboard className="h-4 w-4" />
              <span>Browse Series</span>
            </Link>
          </div>
        </div>

        {/* Storage Info Card */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 text-left flex items-start gap-3.5 shadow-sm">
          <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
            <HardDrive size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              Device Storage &amp; Offline DRM
            </h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Offline downloads are encrypted and tied to your registered device. Playback remains accessible without mobile data as long as your account remains in good standing.
            </p>
          </div>
        </div>
      </main>

      {/* Shared Viewer Bottom Navigation */}
      <ViewerBottomNav activeTab="downloads" />
    </div>
  );
}
