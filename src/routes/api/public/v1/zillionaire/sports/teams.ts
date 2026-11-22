import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { type SportsTeam } from "@/lib/server/sports";

const teamSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-z0-9_-]+$/i),
  competitionId: z.string().min(1).max(80),
  name: z.string().min(1).max(100),
  shortCode: z.string().min(1).max(10).toUpperCase(),
  country: z.string().min(1).max(100),
  crestUrl: z.string().url().max(500).optional(),
  group: z.string().max(50).optional(),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/sports/teams")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "sports");

          const url = new URL(request.url);
          const competitionId = url.searchParams.get("competitionId");

          const docs = await fs.query("sports_teams", { limit: 100 });
          const teams: SportsTeam[] = docs
            .filter((d) => !competitionId || d["competitionId"] === competitionId)
            .map((d) => ({
              id: String(d["id"] || d.__id),
              competitionId: String(d["competitionId"] || ""),
              name: String(d["name"] || ""),
              shortCode: String(d["shortCode"] || ""),
              country: String(d["country"] || ""),
              crestUrl: d["crestUrl"] ? String(d["crestUrl"]) : undefined,
              group: d["group"] ? String(d["group"]) : undefined,
            }));

          return Response.json({ teams });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "sports");

          const body = await parseBody(request, teamSchema);
          await fs.setDoc(`sports_teams/${body.id}`, body);

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "sports.team.saved",
            targetType: "sports_team",
            targetId: body.id,
            reason: `Saved sports team ${body.name} (${body.shortCode}) in competition ${body.competitionId}`,
            metadata: {
              competitionId: body.competitionId,
              name: body.name,
              shortCode: body.shortCode,
              group: body.group,
            },
          });

          return Response.json({ ok: true, team: body });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
