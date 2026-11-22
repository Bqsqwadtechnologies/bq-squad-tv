export type SportType =
  | "Football"
  | "Basketball"
  | "Rugby"
  | "Tennis"
  | "Cricket"
  | "Athletics"
  | "Motorsport"
  | "Combat"
  | "Other";

export type CompetitionFormat = "league" | "tournament";

export type SportsSponsor = {
  id: string;
  name: string;
  logoUrl: string;
  placement: "header" | "sidebar" | "field";
  websiteUrl?: string;
  active: boolean;
};

export type SportsTeam = {
  id: string;
  competitionId: string;
  name: string;
  shortCode: string;
  country: string;
  crestUrl?: string;
  group?: string;
};

export type MatchStatus = "scheduled" | "live" | "ended" | "postponed" | "cancelled";

export type SportsFixture = {
  id: string;
  competitionId: string;
  homeTeam: {
    id: string;
    name: string;
    shortCode: string;
    crestUrl?: string;
  };
  awayTeam: {
    id: string;
    name: string;
    shortCode: string;
    crestUrl?: string;
  };
  round: string;
  group?: string;
  stage?: "group" | "round_of_16" | "quarter_final" | "semi_final" | "final" | "regular_season";
  kickoffIso: string;
  venue: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  liveStreamChannelId?: string;
  liveStreamUrl?: string;
  highlightsAssetId?: string;
};

export type SportsCompetition = {
  id: string;
  name: string;
  sport: SportType;
  format: CompetitionFormat;
  season: string;
  status: "draft" | "published";
  description?: string;
  bannerUrl?: string;
  logoUrl?: string;
  featured?: boolean;
  sponsors?: SportsSponsor[];
  createdAt: string;
  updatedAt: string;
};

export type LeagueStandingRow = {
  teamId: string;
  teamName: string;
  shortCode: string;
  crestUrl?: string;
  group?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

/**
 * Computes official league table standings from ended fixtures.
 * Points: Win = 3, Draw = 1, Loss = 0.
 * Tiebreakers: Points DESC -> Goal Difference DESC -> Goals For DESC -> Team Name ASC.
 */
export function computeStandings(
  teams: SportsTeam[],
  fixtures: SportsFixture[],
  filterGroup?: string,
): LeagueStandingRow[] {
  const tableMap = new Map<string, LeagueStandingRow>();

  for (const team of teams) {
    if (filterGroup && team.group && team.group !== filterGroup) continue;
    tableMap.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      shortCode: team.shortCode,
      crestUrl: team.crestUrl,
      group: team.group,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    });
  }

  for (const fix of fixtures) {
    if (fix.status !== "ended") continue;
    if (typeof fix.homeScore !== "number" || typeof fix.awayScore !== "number") continue;
    if (filterGroup && fix.group && fix.group !== filterGroup) continue;

    const homeRow = tableMap.get(fix.homeTeam.id);
    const awayRow = tableMap.get(fix.awayTeam.id);

    if (homeRow) {
      homeRow.played += 1;
      homeRow.goalsFor += fix.homeScore;
      homeRow.goalsAgainst += fix.awayScore;
      homeRow.goalDiff = homeRow.goalsFor - homeRow.goalsAgainst;

      if (fix.homeScore > fix.awayScore) {
        homeRow.won += 1;
        homeRow.points += 3;
      } else if (fix.homeScore === fix.awayScore) {
        homeRow.drawn += 1;
        homeRow.points += 1;
      } else {
        homeRow.lost += 1;
      }
    }

    if (awayRow) {
      awayRow.played += 1;
      awayRow.goalsFor += fix.awayScore;
      awayRow.goalsAgainst += fix.homeScore;
      awayRow.goalDiff = awayRow.goalsFor - awayRow.goalsAgainst;

      if (fix.awayScore > fix.homeScore) {
        awayRow.won += 1;
        awayRow.points += 3;
      } else if (fix.awayScore === fix.homeScore) {
        awayRow.drawn += 1;
        awayRow.points += 1;
      } else {
        awayRow.lost += 1;
      }
    }
  }

  return Array.from(tableMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });
}

/**
 * Organizes tournament fixtures into bracket stages.
 */
export function computeKnockoutBracket(fixtures: SportsFixture[]): Record<string, SportsFixture[]> {
  const stages: Record<string, SportsFixture[]> = {
    round_of_16: [],
    quarter_final: [],
    semi_final: [],
    final: [],
  };

  for (const fix of fixtures) {
    if (fix.stage && stages[fix.stage]) {
      stages[fix.stage].push(fix);
    }
  }

  return stages;
}
