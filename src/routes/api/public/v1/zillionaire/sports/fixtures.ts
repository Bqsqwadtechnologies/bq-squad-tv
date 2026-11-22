import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { type SportsFixture } from "@/lib/server/sports";

const teamRefSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(100),
  shortCode: z.string().min(1).max(10),
  crestUrl: z.string().url().max(500).optional(),
});

const fixtureSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-z0-9_-]+$/i),
  competitionId: z.string().min(1).max(80),
  homeTeam: teamRefSchema,
  awayTeam: teamRefSchema,
  round: z.string().min(1).max(100),
  group: z.string().max(50).optional(),
  stage: z
    .enum(["group", "round_of_16", "quarter_final", "semi_final", "final", "regular_season"])
    .optional(),
  kickoffIso: z.string().datetime(),
  venue: z.string().min(1).max(150),
  status: z.enum(["scheduled", "live", "ended", "postponed", "cancelled"]).default("scheduled"),
  homeScore: z.number().int().min(0).max(100).optional(),
  awayScore: z.number().int().min(0).max(100).optional(),
  liveStreamChannelId: z.string().max(80).optional(),
  liveStreamUrl: z.string().url().max(500).optional(),
  highlightsAssetId: z.string().max(80).optional(),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/sports/fixtures")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "sports");

          const url = new URL(request.url);
          const competitionId = url.searchParams.get("competitionId");

          const docs = await fs.query("sports_fixtures", { limit: 200 });
          const fixtures = docs
            .filter((d) => !competitionId || d["competitionId"] === competitionId)
            .map((d) => ({
              id: String(d["id"] || d.__id),
              competitionId: String(d["competitionId"] || ""),
              homeTeam: d["homeTeam"] as any,
              awayTeam: d["awayTeam"] as any,
              round: String(d["round"] || ""),
              group: d["group"] ? String(d["group"]) : undefined,
              stage: d["stage"] as any,
              kickoffIso: String(d["kickoffIso"] || ""),
              venue: String(d["venue"] || ""),
              status: d["status"] as any,
              homeScore: typeof d["homeScore"] === "number" ? d["homeScore"] : undefined,
              awayScore: typeof d["awayScore"] === "number" ? d["awayScore"] : undefined,
              liveStreamChannelId: d["liveStreamChannelId"] ? String(d["liveStreamChannelId"]) : undefined,
              liveStreamUrl: d["liveStreamUrl"] ? String(d["liveStreamUrl"]) : undefined,
              highlightsAssetId: d["highlightsAssetId"] ? String(d["highlightsAssetId"]) : undefined,
            }));

          return Response.json({ fixtures });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "sports");

          const body = await parseBody(request, fixtureSchema);
          await fs.setDoc(`sports_fixtures/${body.id}`, body);

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "sports.fixture.updated",
            targetType: "sports_fixture",
            targetId: body.id,
            reason: `Fixture ${body.id} saved with status ${body.status} and score ${body.homeScore ?? "-"}:${body.awayScore ?? "-"}`,
            metadata: {
              competitionId: body.competitionId,
              status: body.status,
              homeScore: body.homeScore,
              awayScore: body.awayScore,
              liveStreamChannelId: body.liveStreamChannelId,
            },
          });

          return Response.json({ ok: true, fixture: body });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
