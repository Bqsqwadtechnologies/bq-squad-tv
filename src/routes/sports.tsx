import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { ViewerBottomNav } from "@/components/ViewerBottomNav";
import { ProfileAccountHub } from "@/components/ProfileAccountHub";
import {
  Trophy,
  Play,
  Calendar,
  Clock,
  Shield,
  Radio,
  Search,
  Sparkles,
  ChevronRight,
  Tv,
  ArrowRight,
  Award,
} from "lucide-react";
import type {
  SportsCompetition,
  SportsFixture,
  SportsTeam,
  LeagueStandingRow,
} from "@/lib/server/sports";

export const Route = createFileRoute("/sports")({
  component: SportsPage,
  head: () => ({
    meta: [
      { title: "Sports Hub — Live Matches, Tournaments & Standings — BQ SQWAD TV" },
      {
        name: "description",
        content:
          "Watch live sports matches, follow tournament brackets, league tables and matchday fixtures on BQ SQWAD TV.",
      },
    ],
  }),
});

function SportsPage() {
  const [competitions, setCompetitions] = useState<SportsCompetition[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string>("");
  const [fixtures, setFixtures] = useState<SportsFixture[]>([]);
  const [standings, setStandings] = useState<LeagueStandingRow[]>([]);
  const [bracket, setBracket] = useState<Record<string, SportsFixture[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"home" | "live" | "table" | "bracket">("home");

  useEffect(() => {
    async function loadSports() {
      try {
        setLoading(true);
        const res = await fetch("/api/public/v1/sports/competitions");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.competitions) && data.competitions.length > 0) {
            setCompetitions(data.competitions);
            setSelectedCompId(data.competitions[0].id);
          }
        }
      } catch {
        // Fallback to clean empty state
      } finally {
        setLoading(false);
      }
    }
    void loadSports();
  }, []);

  useEffect(() => {
    if (!selectedCompId) return;
    async function loadCompDetails() {
      try {
        const res = await fetch(`/api/public/v1/sports/competitions?competitionId=${encodeURIComponent(selectedCompId)}`);
        if (res.ok) {
          const data = await res.json();
          setFixtures(data.fixtures || []);
          setStandings(data.standings || []);
          setBracket(data.bracket || {});
        }
      } catch {
        // Ignore fetch errors
      }
    }
    void loadCompDetails();
  }, [selectedCompId]);

  const selectedCompetition = competitions.find((c) => c.id === selectedCompId);
  const liveMatches = fixtures.filter((f) => f.status === "live");
  const upcomingMatches = fixtures.filter((f) => f.status === "scheduled");
  const pastMatches = fixtures.filter((f) => f.status === "ended");

  return (
    <div className="min-h-screen bg-[#050b1b] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#050b1b]/95 backdrop-blur-md border-b border-white/5 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo size="md" />
          </Link>
          <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-cyan-400 bg-cyan-500/10 px-3 py-1.5 rounded-full border border-cyan-500/20">
            <Trophy size={14} className="text-cyan-400" />
            <span>Sports Hub</span>
          </div>
        </div>

        {/* Top navigation */}
        <div className="flex items-center gap-4">
          <Link
            to="/live-tv"
            className="text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1.5"
          >
            <Radio size={14} className="text-rose-500 animate-pulse" />
            <span>Live TV</span>
          </Link>
          <ProfileAccountHub />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-24 md:pb-12">
        {loading ? (
          <div className="py-24 text-center space-y-3">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            <p className="text-sm text-slate-400">Loading sports hub...</p>
          </div>
        ) : competitions.length === 0 ? (
          /* Clean zero-fake-data empty state */
          <div className="py-20 text-center space-y-4 max-w-lg mx-auto bg-white/[0.02] border border-white/10 rounded-2xl p-8">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto">
              <Trophy size={28} />
            </div>
            <h1 className="text-xl font-bold text-white">Sports Hub</h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              No live sports fixtures scheduled at this time. Check back soon for upcoming tournaments and matches.
            </p>
            <div className="pt-2">
              <Link
                to="/live-tv"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-lg shadow-cyan-500/20"
              >
                <Tv size={14} /> Browse Live Channels
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Competition Selector Bar */}
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
                {competitions.map((comp) => (
                  <button
                    key={comp.id}
                    onClick={() => setSelectedCompId(comp.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 ${
                      selectedCompId === comp.id
                        ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                        : "bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    <Trophy size={14} />
                    <span>{comp.name}</span>
                    <span className="text-[10px] opacity-75 font-normal">({comp.season})</span>
                  </button>
                ))}
              </div>

              {/* View Tabs */}
              <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab("home")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeTab === "home" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab("live")}
                  className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                    activeTab === "live" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {liveMatches.length > 0 && <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />}
                  <span>Matches ({fixtures.length})</span>
                </button>
                {selectedCompetition?.format === "league" || standings.length > 0 ? (
                  <button
                    onClick={() => setActiveTab("table")}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      activeTab === "table" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Standings Table
                  </button>
                ) : null}
                {selectedCompetition?.format === "tournament" ? (
                  <button
                    onClick={() => setActiveTab("bracket")}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      activeTab === "bracket" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Bracket
                  </button>
                ) : null}
              </div>
            </div>

            {/* LIVE NOW BANNER (if any matches are currently live) */}
            {liveMatches.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                  <span>Live Matches Now</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {liveMatches.map((m) => (
                    <div
                      key={m.id}
                      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 border border-rose-500/30 p-5 space-y-4 shadow-xl"
                    >
                      <div className="flex items-center justify-between text-xs text-rose-300">
                        <span className="font-bold flex items-center gap-1.5">
                          <Radio size={12} className="animate-pulse" /> LIVE
                        </span>
                        <span className="text-slate-400">{m.venue}</span>
                      </div>

                      <div className="flex items-center justify-between gap-4 py-2">
                        <div className="flex-1 text-right">
                          <p className="text-base font-bold text-white truncate">{m.homeTeam.name}</p>
                          <span className="text-xs text-slate-400 font-mono">{m.homeTeam.shortCode}</span>
                        </div>
                        <div className="px-4 py-2 bg-black/60 rounded-xl border border-white/10 text-center font-mono font-bold text-xl text-rose-400">
                          {m.homeScore ?? 0} : {m.awayScore ?? 0}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-base font-bold text-white truncate">{m.awayTeam.name}</p>
                          <span className="text-xs text-slate-400 font-mono">{m.awayTeam.shortCode}</span>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-between">
                        <span className="text-xs text-slate-400">{m.round}</span>
                        {m.liveStreamChannelId ? (
                          <Link
                            to="/channels/$channelId"
                            params={{ channelId: m.liveStreamChannelId }}
                            className="inline-flex items-center gap-1.5 bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                          >
                            <Play size={12} className="fill-current" /> Watch Live
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: OVERVIEW / MATCHES */}
            {(activeTab === "home" || activeTab === "live") && (
              <div className="space-y-6">
                {/* Upcoming Fixtures */}
                <div className="space-y-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    Upcoming Fixtures ({upcomingMatches.length})
                  </h2>
                  {upcomingMatches.length === 0 ? (
                    <p className="text-xs text-slate-500 bg-white/[0.02] p-4 rounded-xl border border-white/5">
                      No upcoming fixtures scheduled for this competition.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {upcomingMatches.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-xl bg-white/[0.02] border border-white/10 p-4 space-y-3 hover:border-cyan-500/30 transition"
                        >
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="font-semibold text-cyan-400">{m.round}</span>
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {new Date(m.kickoffIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          <div className="flex items-center justify-between py-1">
                            <div className="font-bold text-sm text-white truncate max-w-[120px]">{m.homeTeam.name}</div>
                            <span className="text-xs text-slate-500 font-mono">VS</span>
                            <div className="font-bold text-sm text-white truncate max-w-[120px] text-right">{m.awayTeam.name}</div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-white/5 pt-2">
                            <span className="truncate max-w-[160px]">{m.venue}</span>
                            <span>{new Date(m.kickoffIso).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Results & Ended Matches */}
                {pastMatches.length > 0 && (
                  <div className="space-y-3 pt-4">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                      Recent Results ({pastMatches.length})
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {pastMatches.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-xl bg-white/[0.02] border border-white/5 p-4 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between text-slate-500">
                            <span>{m.round}</span>
                            <span className="text-emerald-400 font-bold">FT</span>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <span className="font-medium text-white">{m.homeTeam.name}</span>
                            <span className="font-mono font-bold text-white bg-black/40 px-2 py-0.5 rounded">
                              {m.homeScore ?? 0} - {m.awayScore ?? 0}
                            </span>
                            <span className="font-medium text-white">{m.awayTeam.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: STANDINGS TABLE */}
            {activeTab === "table" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    Official League Table — {selectedCompetition?.name}
                  </h2>
                </div>

                {standings.length === 0 ? (
                  <p className="text-xs text-slate-500 bg-white/[0.02] p-4 rounded-xl border border-white/5">
                    No standings calculated yet. Standings update automatically as match results are confirmed.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/5 text-slate-400 font-bold border-b border-white/10 uppercase tracking-wider text-[11px]">
                        <tr>
                          <th className="py-3 px-3 w-10 text-center">#</th>
                          <th className="py-3 px-4">Team</th>
                          <th className="py-3 px-2 text-center">P</th>
                          <th className="py-3 px-2 text-center">W</th>
                          <th className="py-3 px-2 text-center">D</th>
                          <th className="py-3 px-2 text-center">L</th>
                          <th className="py-3 px-2 text-center">GF</th>
                          <th className="py-3 px-2 text-center">GA</th>
                          <th className="py-3 px-2 text-center">GD</th>
                          <th className="py-3 px-3 text-center text-cyan-400">PTS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {standings.map((row, idx) => (
                          <tr key={row.teamId} className="hover:bg-white/[0.03] transition">
                            <td className="py-3 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                            <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                              <span>{row.teamName}</span>
                              <span className="text-[10px] text-slate-500 font-mono font-normal">
                                ({row.shortCode})
                              </span>
                            </td>
                            <td className="py-3 px-2 text-center text-slate-300">{row.played}</td>
                            <td className="py-3 px-2 text-center text-emerald-400">{row.won}</td>
                            <td className="py-3 px-2 text-center text-slate-400">{row.drawn}</td>
                            <td className="py-3 px-2 text-center text-rose-400">{row.lost}</td>
                            <td className="py-3 px-2 text-center text-slate-400">{row.goalsFor}</td>
                            <td className="py-3 px-2 text-center text-slate-400">{row.goalsAgainst}</td>
                            <td className="py-3 px-2 text-center font-mono font-semibold text-slate-300">
                              {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-bold text-cyan-400 text-sm">
                              {row.points}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB: KNOCKOUT BRACKET */}
            {activeTab === "bracket" && (
              <div className="space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                  Tournament Knockout Bracket — {selectedCompetition?.name}
                </h2>
                <div className="grid gap-4 md:grid-cols-3">
                  {/* Quarter-Finals */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Quarter-Finals</h3>
                    {(bracket["quarter_final"] || []).length === 0 ? (
                      <p className="text-xs text-slate-500 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                        Matches not set
                      </p>
                    ) : (
                      bracket["quarter_final"].map((m) => (
                        <div key={m.id} className="p-3 bg-white/[0.02] border border-white/10 rounded-xl space-y-1 text-xs">
                          <div className="flex justify-between text-white font-semibold">
                            <span>{m.homeTeam.name}</span>
                            <span>{m.homeScore ?? "-"}</span>
                          </div>
                          <div className="flex justify-between text-white font-semibold">
                            <span>{m.awayTeam.name}</span>
                            <span>{m.awayScore ?? "-"}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Semi-Finals */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Semi-Finals</h3>
                    {(bracket["semi_final"] || []).length === 0 ? (
                      <p className="text-xs text-slate-500 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                        Matches not set
                      </p>
                    ) : (
                      bracket["semi_final"].map((m) => (
                        <div key={m.id} className="p-3 bg-white/[0.02] border border-white/10 rounded-xl space-y-1 text-xs">
                          <div className="flex justify-between text-white font-semibold">
                            <span>{m.homeTeam.name}</span>
                            <span>{m.homeScore ?? "-"}</span>
                          </div>
                          <div className="flex justify-between text-white font-semibold">
                            <span>{m.awayTeam.name}</span>
                            <span>{m.awayScore ?? "-"}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Final */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Award size={14} /> Final
                    </h3>
                    {(bracket["final"] || []).length === 0 ? (
                      <p className="text-xs text-slate-500 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                        Grand final fixture not set
                      </p>
                    ) : (
                      bracket["final"].map((m) => (
                        <div key={m.id} className="p-4 bg-gradient-to-br from-amber-950/20 to-slate-900 border border-amber-500/30 rounded-xl space-y-2 text-xs">
                          <div className="flex justify-between text-white font-bold text-sm">
                            <span>{m.homeTeam.name}</span>
                            <span>{m.homeScore ?? "-"}</span>
                          </div>
                          <div className="flex justify-between text-white font-bold text-sm">
                            <span>{m.awayTeam.name}</span>
                            <span>{m.awayScore ?? "-"}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SPONSORS SECTION */}
            {selectedCompetition?.sponsors && selectedCompetition.sponsors.length > 0 && (
              <div className="border-t border-white/10 pt-6 space-y-3">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Official Tournament Partners
                </span>
                <div className="flex flex-wrap items-center gap-6">
                  {selectedCompetition.sponsors
                    .filter((s) => s.active)
                    .map((s) => (
                      <div key={s.id} className="flex items-center gap-2 opacity-75 hover:opacity-100 transition">
                        <img src={s.logoUrl} alt={s.name} className="h-6 object-contain" />
                        <span className="text-xs text-slate-400 font-semibold">{s.name}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <ViewerBottomNav activeTab="sports" />
    </div>
  );
}
