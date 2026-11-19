import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Tv2,
  Radio,
  ArrowLeft,
  LoaderCircle,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { restoreWebSession } from "@/lib/firebase-web-auth";

type Channel = {
  id: string;
  name: string;
  logoUrl: string | null;
  categories: string[];
  language: string;
  status: string;
  health: string;
  currentProgramme: string;
  currentViewers: number;
  totalWatchMinutes: number;
  licenceExpiresAt: string | null;
};

export const Route = createFileRoute("/provider/channels")({
  component: ProviderChannelsPage,
  head: () => ({
    meta: [
      { title: "Channels | Partner Portal" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProviderChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await restoreWebSession();
        if (!token) {
          setError("Please sign in from the partner portal home.");
          setBusy(false);
          return;
        }
        const res = await fetch("/api/public/v1/provider/channels", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load partner channels");
        const data = (await res.json()) as { channels: Channel[] };
        if (active) setChannels(data.channels || []);
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/provider"
              aria-label="Back to partner dashboard"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="font-bold text-lg text-white">Live Channels</h1>
          </div>
          <Link
            to="/provider"
            aria-label="Return to partner dashboard"
            className="text-xs text-cyan-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded"
          >
            Partner Dashboard
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full" role="main">
        {busy ? (
          <div className="py-24 text-center" role="status" aria-live="polite">
            <LoaderCircle className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading channels...</p>
          </div>
        ) : error ? (
          <div
            className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
            role="alert"
          >
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Broadcast Channels</h2>
                <p className="text-xs text-slate-400">
                  Live streams provisioned under your licence agreement.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-300">
                {channels.length} {channels.length === 1 ? "Channel" : "Channels"}
              </span>
            </div>

            {channels.length === 0 ? (
              <div
                className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800"
                role="status"
              >
                <Tv2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-white mb-1">
                  No channels provisioned yet
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Contact BQ SQWAD TV operations to register new live channel streams or verify
                  stream ingestion.
                </p>
              </div>
            ) : (
              <div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                role="region"
                aria-label="Channels list"
              >
                {channels.map((channel) => (
                  <div
                    key={channel.id}
                    tabIndex={0}
                    className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          {channel.logoUrl ? (
                            <img
                              src={channel.logoUrl}
                              alt={`Logo of ${channel.name}`}
                              className="w-10 h-10 rounded-xl object-cover bg-slate-800"
                            />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-cyan-400 font-bold"
                              aria-hidden="true"
                            >
                              <Radio className="w-5 h-5" />
                            </div>
                          )}
                          <div>
                            <h3 className="font-semibold text-white text-sm">{channel.name}</h3>
                            <div className="text-xs text-slate-400">
                              {channel.language.toUpperCase()} •{" "}
                              {channel.categories.join(", ") || "General"}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                            channel.status === "published"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {channel.status}
                        </span>
                      </div>

                      <div className="space-y-2 py-3 border-y border-slate-800 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Current Programme:</span>
                          <span className="text-slate-200 font-medium truncate max-w-[180px]">
                            {channel.currentProgramme}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Stream Health:</span>
                          <span
                            className={`font-medium flex items-center gap-1 ${
                              channel.health === "healthy" ? "text-emerald-400" : "text-amber-400"
                            }`}
                          >
                            {channel.health === "healthy" ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <AlertTriangle className="w-3 h-3" />
                            )}
                            {channel.health}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Estimated Viewers:</span>
                          <span className="text-slate-200 font-medium">
                            {channel.currentViewers}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Verified Minutes:</span>
                          <span className="text-slate-200 font-medium">
                            {channel.totalWatchMinutes.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {channel.licenceExpiresAt && (
                      <div className="mt-3 pt-2 text-[11px] text-slate-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                        <span>
                          Licence valid through{" "}
                          {new Date(channel.licenceExpiresAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
