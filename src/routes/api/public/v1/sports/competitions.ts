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
              description: compDoc["description"] ? String(compDoc["description"]) : undefined,
              bannerUrl: compDoc["bannerUrl"] ? String(compDoc["bannerUrl"]) : undefined,
              logoUrl: compDoc["logoUrl"] ? String(compDoc["logoUrl"]) : undefined,
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
                crestUrl: t["crestUrl"] ? String(t["crestUrl"]) : undefined,
                group: t["group"] ? String(t["group"]) : undefined,
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
                group: f["group"] ? String(f["group"]) : undefined,
                stage: f["stage"] as any,
                kickoffIso: String(f["kickoffIso"] || ""),
                venue: String(f["venue"] || ""),
                status: f["status"] as any,
                homeScore: typeof f["homeScore"] === "number" ? f["homeScore"] : undefined,
                awayScore: typeof f["awayScore"] === "number" ? f["awayScore"] : undefined,
                liveStreamChannelId: f["liveStreamChannelId"] ? String(f["liveStreamChannelId"]) : undefined,
                liveStreamUrl: f["liveStreamUrl"] ? String(f["liveStreamUrl"]) : undefined,
                highlightsAssetId: f["highlightsAssetId"] ? String(f["highlightsAssetId"]) : undefined,
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
              description: d["description"] ? String(d["description"]) : undefined,
              bannerUrl: d["bannerUrl"] ? String(d["bannerUrl"]) : undefined,
              logoUrl: d["logoUrl"] ? String(d["logoUrl"]) : undefined,
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
