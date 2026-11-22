import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { type SportsCompetition } from "@/lib/server/sports";

const sponsorSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(100),
  logoUrl: z.string().url().max(500),
  placement: z.enum(["header", "sidebar", "field"]),
  websiteUrl: z.string().url().max(500).optional(),
  active: z.boolean().default(true),
});

const competitionSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-z0-9_-]+$/i),
  name: z.string().min(1).max(150),
  sport: z.enum([
    "Football",
    "Basketball",
    "Rugby",
    "Tennis",
    "Cricket",
    "Athletics",
    "Motorsport",
    "Combat",
    "Other",
  ]),
  format: z.enum(["league", "tournament"]),
  season: z.string().min(1).max(50),
  status: z.enum(["draft", "published"]).default("draft"),
  description: z.string().max(1000).optional(),
  bannerUrl: z.string().url().max(500).optional(),
  logoUrl: z.string().url().max(500).optional(),
  featured: z.boolean().default(false),
  sponsors: z.array(sponsorSchema).max(20).default([]),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/sports/competitions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "sports");

          const docs = await fs.query("sports_competitions", { limit: 100 });
          const competitions = docs.map((d) => ({
            id: String(d["id"] || d.__id),
            name: String(d["name"] || ""),
            sport: d["sport"],
            format: d["format"],
            season: String(d["season"] || ""),
            status: d["status"] || "draft",
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
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "sports");

          const body = await parseBody(request, competitionSchema);
          const now = new Date().toISOString();

          const existing = await fs.getDoc(`sports_competitions/${body.id}`);
          const payload: SportsCompetition = {
            ...body,
            createdAt: existing && typeof existing["createdAt"] === "string" ? existing["createdAt"] : now,
            updatedAt: now,
          };

          await fs.setDoc(`sports_competitions/${body.id}`, payload);

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: existing ? "sports.competition.updated" : "sports.competition.created",
            targetType: "sports_competition",
            targetId: body.id,
            reason: `Sports competition ${body.id} saved with status ${body.status}`,
            metadata: {
              name: body.name,
              format: body.format,
              season: body.season,
              status: body.status,
            },
          });

          return Response.json({ ok: true, competition: payload });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
