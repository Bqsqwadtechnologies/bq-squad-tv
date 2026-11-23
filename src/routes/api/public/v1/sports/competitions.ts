import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import {
  computeStandings,
  computeKnockoutBracket,
  type SportsCompetition,
  type SportsTeam,
  type SportsFixture,
} from "@/lib/server/sports";

export const Route = createFileRoute("/api/public/v1/sports/competitions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const fs = await Firestore.create();
          const url = new URL(request.url);
          const competitionId = url.searchParams.get("competitionId");

          if (competitionId) {
            const compDoc = await fs.getDoc(`sports_competitions/${competitionId}`);
            if (!compDoc || compDoc["status"] !== "published") {
              return Response.json(
                { error: "Competition not found or not published" },
                { status: 404 },
              );
            }

            const comp: SportsCompetition = {
              id: competitionId,
              name: String(compDoc["name"] || ""),
              sport: compDoc["sport"] as any,
              format: compDoc["format"] as any,
              season: String(compDoc["season"] || ""),
              status: "published",
              ...(compDoc["description"] ? { description: String(compDoc["description"]) } : {}),
              ...(compDoc["bannerUrl"] ? { bannerUrl: String(compDoc["bannerUrl"]) } : {}),
              ...(compDoc["logoUrl"] ? { logoUrl: String(compDoc["logoUrl"]) } : {}),
              featured: Boolean(compDoc["featured"]),
              sponsors: Array.isArray(compDoc["sponsors"]) ? compDoc["sponsors"] : [],
              createdAt: String(compDoc["createdAt"] || ""),
              updatedAt: String(compDoc["updatedAt"] || ""),
            };

            const teamDocs = await fs.query("sports_teams", { limit: 100 });
            const teams: SportsTeam[] = teamDocs
              .filter((t) => t["competitionId"] === competitionId)
              .map((t) => ({
                id: String(t["id"] || t.__id),
                competitionId,
                name: String(t["name"] || ""),
                shortCode: String(t["shortCode"] || ""),
                country: String(t["country"] || ""),
                ...(t["crestUrl"] ? { crestUrl: String(t["crestUrl"]) } : {}),
                ...(t["group"] ? { group: String(t["group"]) } : {}),
              }));

            const fixtureDocs = await fs.query("sports_fixtures", { limit: 200 });
            const fixtures: SportsFixture[] = fixtureDocs
              .filter((f) => f["competitionId"] === competitionId)
              .map((f) => ({
                id: String(f["id"] || f.__id),
                competitionId,
                homeTeam: f["homeTeam"] as any,
                awayTeam: f["awayTeam"] as any,
                round: String(f["round"] || ""),
                ...(f["group"] ? { group: String(f["group"]) } : {}),
                stage: f["stage"] as any,
                kickoffIso: String(f["kickoffIso"] || ""),
                venue: String(f["venue"] || ""),
                status: f["status"] as any,
                ...(typeof f["homeScore"] === "number" ? { homeScore: f["homeScore"] } : {}),
                ...(typeof f["awayScore"] === "number" ? { awayScore: f["awayScore"] } : {}),
                ...(f["liveStreamChannelId"] ? { liveStreamChannelId: String(f["liveStreamChannelId"]) } : {}),
                ...(f["liveStreamUrl"] ? { liveStreamUrl: String(f["liveStreamUrl"]) } : {}),
                ...(f["highlightsAssetId"] ? { highlightsAssetId: String(f["highlightsAssetId"]) } : {}),
              }));

            const standings = computeStandings(teams, fixtures);
            const bracket = computeKnockoutBracket(fixtures);

            return Response.json({
              competition: comp,
              teams,
              fixtures,
              standings,
              bracket,
            });
          }

          // List all published competitions
          const docs = await fs.query("sports_competitions", { limit: 50 });
          const competitions: SportsCompetition[] = docs
            .filter((d) => d["status"] === "published")
            .map((d) => ({
              id: String(d["id"] || d.__id),
              name: String(d["name"] || ""),
              sport: d["sport"] as any,
              format: d["format"] as any,
              season: String(d["season"] || ""),
              status: "published",
              ...(d["description"] ? { description: String(d["description"]) } : {}),
              ...(d["bannerUrl"] ? { bannerUrl: String(d["bannerUrl"]) } : {}),
              ...(d["logoUrl"] ? { logoUrl: String(d["logoUrl"]) } : {}),
              featured: Boolean(d["featured"]),
              sponsors: Array.isArray(d["sponsors"]) ? d["sponsors"] : [],
              createdAt: String(d["createdAt"] || ""),
              updatedAt: String(d["updatedAt"] || ""),
            }));

          return Response.json({ competitions });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
