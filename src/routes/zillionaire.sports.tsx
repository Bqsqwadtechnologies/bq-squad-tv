import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import { ConsoleShell } from "@/components/ConsoleShell";
import {
  Trophy,
  Plus,
  Shield,
  Calendar,
  Radio,
  CheckCircle2,
  AlertCircle,
  Eye,
  Edit2,
  Tv,
  RefreshCw,
  Clock,
} from "lucide-react";
import type {
  SportsCompetition,
  SportsFixture,
  SportsTeam,
  SportType,
  CompetitionFormat,
} from "@/lib/server/sports";

export const Route = createFileRoute("/zillionaire/sports")({
  component: ZillionaireSportsControlPage,
  head: () => ({
    meta: [{ title: "Sports Hub Control — Zillionaire Console — BQ SQWAD TV" }],
  }),
});

function ZillionaireSportsControlPage() {
  return (
    <ConsolePageGuard requiredModule="sports">
      <SportsControlContent />
    </ConsolePageGuard>
  );
}

function SportsControlContent() {
  const [competitions, setCompetitions] = useState<SportsCompetition[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string>("");
  const [teams, setTeams] = useState<SportsTeam[]>([]);
  const [fixtures, setFixtures] = useState<SportsFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"competitions" | "teams" | "fixtures">("competitions");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Competition form state
  const [compForm, setCompForm] = useState({
    id: "",
    name: "",
    sport: "Football" as SportType,
    format: "league" as CompetitionFormat,
    season: new Date().getFullYear().toString(),
    status: "draft" as "draft" | "published",
    description: "",
    bannerUrl: "",
    featured: false,
  });

  // Team form state
  const [teamForm, setTeamForm] = useState({
    id: "",
    name: "",
    shortCode: "",
    country: "Nigeria",
    crestUrl: "",
    group: "",
  });

  // Fixture form state
  const [fixtureForm, setFixtureForm] = useState({
    id: "",
    homeTeamId: "",
    awayTeamId: "",
    round: "Matchday 1",
    kickoffIso: new Date().toISOString().slice(0, 16),
    venue: "Main Stadium",
    status: "scheduled" as "scheduled" | "live" | "ended",
    homeScore: 0,
    awayScore: 0,
    liveStreamChannelId: "",
  });

  async function loadCompetitions() {
    try {
      setLoading(true);
      const res = await fetch("/api/public/v1/zillionaire/sports/competitions");
      if (res.ok) {
        const data = await res.json();
        setCompetitions(data.competitions || []);
        if (data.competitions?.length > 0 && !selectedCompId) {
          setSelectedCompId(data.competitions[0].id);
        }
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }

  async function loadCompDetails(compId: string) {
    if (!compId) return;
    try {
      const [teamsRes, fixRes] = await Promise.all([
        fetch(`/api/public/v1/zillionaire/sports/teams?competitionId=${encodeURIComponent(compId)}`),
        fetch(`/api/public/v1/zillionaire/sports/fixtures?competitionId=${encodeURIComponent(compId)}`),
      ]);
      if (teamsRes.ok) {
        const tData = await teamsRes.json();
        setTeams(tData.teams || []);
      }
      if (fixRes.ok) {
        const fData = await fixRes.json();
        setFixtures(fData.fixtures || []);
      }
    } catch {
      // Ignore
    }
  }

  useEffect(() => {
    void loadCompetitions();
  }, []);

  useEffect(() => {
    if (selectedCompId) {
      void loadCompDetails(selectedCompId);
    }
  }, [selectedCompId]);

  async function handleSaveCompetition(e: React.FormEvent) {
    e.preventDefault();
    try {
      setMessage(null);
      const res = await fetch("/api/public/v1/zillionaire/sports/competitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(compForm),
      });
      if (res.ok) {
        setMessage({ text: `Competition "${compForm.name}" saved successfully!`, type: "success" });
        await loadCompetitions();
        setSelectedCompId(compForm.id);
      } else {
        const err = await res.json();
        setMessage({ text: err.error || "Failed to save competition", type: "error" });
      }
    } catch (err: unknown) {
      setMessage({ text: String(err), type: "error" });
    }
  }

  async function handleSaveTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompId) return;
    try {
      setMessage(null);
      const res = await fetch("/api/public/v1/zillionaire/sports/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...teamForm,
          competitionId: selectedCompId,
        }),
      });
      if (res.ok) {
        setMessage({ text: `Team "${teamForm.name}" saved!`, type: "success" });
        await loadCompDetails(selectedCompId);
        setTeamForm({ id: "", name: "", shortCode: "", country: "Nigeria", crestUrl: "", group: "" });
      } else {
        const err = await res.json();
        setMessage({ text: err.error || "Failed to save team", type: "error" });
      }
    } catch (err: unknown) {
      setMessage({ text: String(err), type: "error" });
    }
  }

  async function handleSaveFixture(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompId) return;
    const homeTeam = teams.find((t) => t.id === fixtureForm.homeTeamId);
    const awayTeam = teams.find((t) => t.id === fixtureForm.awayTeamId);

    if (!homeTeam || !awayTeam) {
      setMessage({ text: "Please select both home and away teams", type: "error" });
      return;
    }

    try {
      setMessage(null);
      const res = await fetch("/api/public/v1/zillionaire/sports/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: fixtureForm.id,
          competitionId: selectedCompId,
          homeTeam: { id: homeTeam.id, name: homeTeam.name, shortCode: homeTeam.shortCode },
          awayTeam: { id: awayTeam.id, name: awayTeam.name, shortCode: awayTeam.shortCode },
          round: fixtureForm.round,
          kickoffIso: new Date(fixtureForm.kickoffIso).toISOString(),
          venue: fixtureForm.venue,
          status: fixtureForm.status,
          homeScore: fixtureForm.homeScore,
          awayScore: fixtureForm.awayScore,
          liveStreamChannelId: fixtureForm.liveStreamChannelId || undefined,
        }),
      });
      if (res.ok) {
        setMessage({ text: `Fixture saved successfully!`, type: "success" });
        await loadCompDetails(selectedCompId);
      } else {
        const err = await res.json();
        setMessage({ text: err.error || "Failed to save fixture", type: "error" });
      }
    } catch (err: unknown) {
      setMessage({ text: String(err), type: "error" });
    }
  }

  const selectedCompetition = competitions.find((c) => c.id === selectedCompId);

  return (
    <ConsoleShell consoleType="zillionaire" title="Sports Hub" activePath="/zillionaire/sports">
      <div className="space-y-6 max-w-6xl mx-auto pb-12">
        {/* Top Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-white/10 pb-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Trophy className="text-cyan-400" size={24} />
              <span>Sports Hub Control</span>
            </h1>
            <p className="text-xs text-slate-400">
              Manage live sports competitions, tournament brackets, league tables, and matchday streaming.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                void loadCompetitions();
                if (selectedCompId) void loadCompDetails(selectedCompId);
              }}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition flex items-center gap-1.5"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* Status notice */}
        {message && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              message.type === "success"
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                : "bg-rose-950/40 border-rose-500/30 text-rose-300"
            }`}
          >
            {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Competition Picker */}
        <div className="flex items-center justify-between flex-wrap gap-3 bg-white/[0.02] border border-white/10 p-3 rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Active Competition:</span>
            <select
              value={selectedCompId}
              onChange={(e) => setSelectedCompId(e.target.value)}
              className="bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              {competitions.length === 0 ? (
                <option value="">No competitions created</option>
              ) : (
                competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.season}) [{c.status}]
                  </option>
                ))
              )}
            </select>
          </div>

          {selectedCompetition && (
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                  selectedCompetition.status === "published"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                }`}
              >
                {selectedCompetition.status}
              </span>
              <span className="text-slate-400">Format: {selectedCompetition.format}</span>
            </div>
          )}
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-2 text-xs font-bold">
          <button
            onClick={() => setActiveTab("competitions")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "competitions" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            Competitions ({competitions.length})
          </button>
          <button
            onClick={() => setActiveTab("teams")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "teams" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            Teams ({teams.length})
          </button>
          <button
            onClick={() => setActiveTab("fixtures")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "fixtures" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            Fixtures & Scores ({fixtures.length})
          </button>
        </div>

        {/* TAB 1: COMPETITIONS */}
        {activeTab === "competitions" && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Create / Edit Form */}
            <form
              onSubmit={handleSaveCompetition}
              className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 space-y-4"
            >
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Plus size={16} className="text-cyan-400" />
                <span>Create / Edit Competition</span>
              </h2>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Competition ID (slug)</label>
                  <input
                    type="text"
                    required
                    value={compForm.id}
                    onChange={(e) => setCompForm({ ...compForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                    placeholder="e.g. premier-league-2026"
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Competition Name</label>
                  <input
                    type="text"
                    required
                    value={compForm.name}
                    onChange={(e) => setCompForm({ ...compForm, name: e.target.value })}
                    placeholder="e.g. West African Champions Cup"
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Sport</label>
                    <select
                      value={compForm.sport}
                      onChange={(e) => setCompForm({ ...compForm, sport: e.target.value as SportType })}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="Football">Football</option>
                      <option value="Basketball">Basketball</option>
                      <option value="Rugby">Rugby</option>
                      <option value="Tennis">Tennis</option>
                      <option value="Cricket">Cricket</option>
                      <option value="Athletics">Athletics</option>
                      <option value="Motorsport">Motorsport</option>
                      <option value="Combat">Combat</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Format</label>
                    <select
                      value={compForm.format}
                      onChange={(e) => setCompForm({ ...compForm, format: e.target.value as CompetitionFormat })}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="league">League Table</option>
                      <option value="tournament">Tournament Bracket</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Season</label>
                    <input
                      type="text"
                      required
                      value={compForm.season}
                      onChange={(e) => setCompForm({ ...compForm, season: e.target.value })}
                      placeholder="2026 / 2026-27"
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Publication Status</label>
                    <select
                      value={compForm.status}
                      onChange={(e) => setCompForm({ ...compForm, status: e.target.value as "draft" | "published" })}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-bold"
                    >
                      <option value="draft">Draft (Hidden)</option>
                      <option value="published">Published (Live to Viewers)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Description</label>
                  <textarea
                    rows={2}
                    value={compForm.description}
                    onChange={(e) => setCompForm({ ...compForm, description: e.target.value })}
                    placeholder="Optional overview of the tournament..."
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20"
              >
                Save Competition
              </button>
            </form>

            {/* List of competitions */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Existing Competitions</h2>
              {competitions.length === 0 ? (
                <div className="p-8 text-center bg-white/[0.02] border border-white/10 rounded-2xl text-xs text-slate-500">
                  No competitions added yet. Use the form to create your first sports competition.
                </div>
              ) : (
                <div className="space-y-2">
                  {competitions.map((c) => (
                    <div
                      key={c.id}
                      className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl flex items-center justify-between text-xs hover:border-cyan-500/30 transition"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{c.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              c.status === "published"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {c.status}
                          </span>
                        </div>
                        <p className="text-slate-400 mt-1">
                          {c.sport} • {c.format === "league" ? "League" : "Tournament"} • Season {c.season}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setCompForm({
                            id: c.id,
                            name: c.name,
                            sport: c.sport,
                            format: c.format,
                            season: c.season,
                            status: c.status,
                            description: c.description || "",
                            bannerUrl: c.bannerUrl || "",
                            featured: Boolean(c.featured),
                          });
                          setSelectedCompId(c.id);
                        }}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition"
                        title="Edit Competition"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: TEAMS */}
        {activeTab === "teams" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <form onSubmit={handleSaveTeam} className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Plus size={16} className="text-cyan-400" />
                <span>Add / Edit Team</span>
              </h2>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Team ID (slug)</label>
                  <input
                    type="text"
                    required
                    value={teamForm.id}
                    onChange={(e) => setTeamForm({ ...teamForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                    placeholder="e.g. enyimba-fc"
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Team Name</label>
                  <input
                    type="text"
                    required
                    value={teamForm.name}
                    onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                    placeholder="e.g. Enyimba FC"
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Short Code (3-4 chars)</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={teamForm.shortCode}
                      onChange={(e) => setTeamForm({ ...teamForm, shortCode: e.target.value.toUpperCase() })}
                      placeholder="ENY"
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Country</label>
                    <input
                      type="text"
                      required
                      value={teamForm.country}
                      onChange={(e) => setTeamForm({ ...teamForm, country: e.target.value })}
                      placeholder="Nigeria"
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20"
              >
                Save Team
              </button>
            </form>

            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                Teams in {selectedCompetition?.name || "Selected Competition"}
              </h2>
              {teams.length === 0 ? (
                <div className="p-8 text-center bg-white/[0.02] border border-white/10 rounded-2xl text-xs text-slate-500">
                  No teams registered for this competition yet.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {teams.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 bg-white/[0.02] border border-white/10 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-white">{t.name}</span>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {t.shortCode} • {t.country}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: FIXTURES */}
        {activeTab === "fixtures" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <form onSubmit={handleSaveFixture} className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Plus size={16} className="text-cyan-400" />
                <span>Add / Update Fixture & Score</span>
              </h2>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Fixture ID</label>
                  <input
                    type="text"
                    required
                    value={fixtureForm.id}
                    onChange={(e) => setFixtureForm({ ...fixtureForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                    placeholder="e.g. match-01"
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Home Team</label>
                    <select
                      value={fixtureForm.homeTeamId}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, homeTeamId: e.target.value })}
                      required
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">Select team</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Away Team</label>
                    <select
                      value={fixtureForm.awayTeamId}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, awayTeamId: e.target.value })}
                      required
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">Select team</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Round / Stage</label>
                    <input
                      type="text"
                      required
                      value={fixtureForm.round}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, round: e.target.value })}
                      placeholder="Matchday 1"
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Match Status</label>
                    <select
                      value={fixtureForm.status}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, status: e.target.value as any })}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-bold"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="live">Live Now</option>
                      <option value="ended">Ended (Full Time)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Home Score</label>
                    <input
                      type="number"
                      min={0}
                      value={fixtureForm.homeScore}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, homeScore: parseInt(e.target.value) || 0 })}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Away Score</label>
                    <input
                      type="number"
                      min={0}
                      value={fixtureForm.awayScore}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, awayScore: parseInt(e.target.value) || 0 })}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Live Stream Channel ID</label>
                  <input
                    type="text"
                    value={fixtureForm.liveStreamChannelId}
                    onChange={(e) => setFixtureForm({ ...fixtureForm, liveStreamChannelId: e.target.value })}
                    placeholder="e.g. sports-channel-1"
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20"
              >
                Save Fixture & Score
              </button>
            </form>

            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                Fixtures in {selectedCompetition?.name || "Selected Competition"}
              </h2>
              {fixtures.length === 0 ? (
                <div className="p-8 text-center bg-white/[0.02] border border-white/10 rounded-2xl text-xs text-slate-500">
                  No fixtures scheduled yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {fixtures.map((f) => (
                    <div
                      key={f.id}
                      className="p-3 bg-white/[0.02] border border-white/10 rounded-xl flex items-center justify-between text-xs hover:border-cyan-500/30 transition"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              f.status === "live"
                                ? "bg-rose-500/20 text-rose-400"
                                : f.status === "ended"
                                  ? "bg-slate-500/20 text-slate-400"
                                  : "bg-cyan-500/20 text-cyan-400"
                            }`}
                          >
                            {f.status}
                          </span>
                          <span className="font-bold text-white">
                            {f.homeTeam.name} vs {f.awayTeam.name}
                          </span>
                        </div>
                        <p className="text-slate-400 mt-0.5 font-mono">
                          Score: {f.homeScore ?? "-"} - {f.awayScore ?? "-"} | {f.round}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setFixtureForm({
                            id: f.id,
                            homeTeamId: f.homeTeam.id,
                            awayTeamId: f.awayTeam.id,
                            round: f.round,
                            kickoffIso: f.kickoffIso.slice(0, 16),
                            venue: f.venue,
                            status: f.status as any,
                            homeScore: f.homeScore ?? 0,
                            awayScore: f.awayScore ?? 0,
                            liveStreamChannelId: f.liveStreamChannelId || "",
                          });
                        }}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition"
                        title="Edit Fixture"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
