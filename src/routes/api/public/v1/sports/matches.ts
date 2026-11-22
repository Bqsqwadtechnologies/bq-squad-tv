import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { type SportsFixture } from "@/lib/server/sports";

export const Route = createFileRoute("/api/public/v1/sports/matches")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const fs = await Firestore.create();
          const url = new URL(request.url);
          const matchId = url.searchParams.get("matchId");
          const filterStatus = url.searchParams.get("status"); // "live", "scheduled", "ended"

          // Check published competitions
          const compDocs = await fs.query("sports_competitions", { limit: 100 });
          const publishedCompIds = new Set(
            compDocs.filter((c) => c["status"] === "published").map((c) => String(c["id"] || c.__id)),
          );

          if (matchId) {
            const fixDoc = await fs.getDoc(`sports_fixtures/${matchId}`);
            if (!fixDoc || !publishedCompIds.has(String(fixDoc["competitionId"] || ""))) {
              return Response.json({ error: "Match not found or competition not published" }, { status: 404 });
            }

            const match: SportsFixture = {
              id: matchId,
              competitionId: String(fixDoc["competitionId"] || ""),
              homeTeam: fixDoc["homeTeam"] as any,
              awayTeam: fixDoc["awayTeam"] as any,
              round: String(fixDoc["round"] || ""),
              group: fixDoc["group"] ? String(fixDoc["group"]) : undefined,
              stage: fixDoc["stage"] as any,
              kickoffIso: String(fixDoc["kickoffIso"] || ""),
              venue: String(fixDoc["venue"] || ""),
              status: fixDoc["status"] as any,
              homeScore: typeof fixDoc["homeScore"] === "number" ? fixDoc["homeScore"] : undefined,
              awayScore: typeof fixDoc["awayScore"] === "number" ? fixDoc["awayScore"] : undefined,
              liveStreamChannelId: fixDoc["liveStreamChannelId"] ? String(fixDoc["liveStreamChannelId"]) : undefined,
              liveStreamUrl: fixDoc["liveStreamUrl"] ? String(fixDoc["liveStreamUrl"]) : undefined,
              highlightsAssetId: fixDoc["highlightsAssetId"] ? String(fixDoc["highlightsAssetId"]) : undefined,
            };

            return Response.json({ match });
          }

          // Query fixtures for published competitions
          const fixtureDocs = await fs.query("sports_fixtures", { limit: 100 });
          let matches: SportsFixture[] = fixtureDocs
            .filter((f) => publishedCompIds.has(String(f["competitionId"] || "")))
            .map((f) => ({
              id: String(f["id"] || f.__id),
              competitionId: String(f["competitionId"] || ""),
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

          if (filterStatus) {
            matches = matches.filter((m) => m.status === filterStatus);
          }

          // Sort: live first, then by kickoff time ASC
          matches.sort((a, b) => {
            if (a.status === "live" && b.status !== "live") return -1;
            if (b.status === "live" && a.status !== "live") return 1;
            return Date.parse(a.kickoffIso) - Date.parse(b.kickoffIso);
          });

          return Response.json({ matches });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
