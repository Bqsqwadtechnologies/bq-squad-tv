import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export type CastCrewMember = {
  name: string;
  role: string;
};

export type EpisodeRecord = {
  id: string;
  seriesId: string;
  seasonId: string;
  episodeNumber: number;
  title: string;
  description: string;
  durationMinutes: number;
  videoAssetId?: string;
  skipIntroSeconds?: number;
  nextEpisodeOffsetSeconds?: number;
  ageRatingOverride?: string;
  status: "DRAFT" | "READY" | "PUBLISHED" | "COMING_SOON";
  scheduledReleaseAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SeasonRecord = {
  id: string;
  seriesId: string;
  seasonNumber: number;
  title: string;
  description?: string;
  episodes: EpisodeRecord[];
  createdAt: string;
};

export type SeriesRecord = {
  id: string;
  title: string;
  description: string;
  channelId: string;
  genre: string;
  ageRating: string;
  posterUrl?: string;
  backdropUrl?: string;
  trailerUrl?: string;
  cast: CastCrewMember[];
  crew: CastCrewMember[];
  status: "DRAFT" | "PUBLISHED" | "COMING_SOON" | "ARCHIVED";
  scheduledReleaseAt?: string;
  seasons: SeasonRecord[];
  createdAt: string;
  updatedAt: string;
};

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE_SERIES"),
    title: z.string().min(1),
    description: z.string().min(1),
    channelId: z.string().min(1),
    genre: z.string().default("Drama"),
    ageRating: z.string().default("13+"),
    posterUrl: z.string().optional(),
    backdropUrl: z.string().optional(),
    trailerUrl: z.string().optional(),
    cast: z.array(z.object({ name: z.string(), role: z.string() })).default([]),
    crew: z.array(z.object({ name: z.string(), role: z.string() })).default([]),
    status: z.enum(["DRAFT", "PUBLISHED", "COMING_SOON", "ARCHIVED"]).default("DRAFT"),
    scheduledReleaseAt: z.string().optional(),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("UPDATE_SERIES"),
    seriesId: z.string().min(1),
    changes: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      channelId: z.string().optional(),
      genre: z.string().optional(),
      ageRating: z.string().optional(),
      posterUrl: z.string().optional(),
      backdropUrl: z.string().optional(),
      trailerUrl: z.string().optional(),
      cast: z.array(z.object({ name: z.string(), role: z.string() })).optional(),
      crew: z.array(z.object({ name: z.string(), role: z.string() })).optional(),
      status: z.enum(["DRAFT", "PUBLISHED", "COMING_SOON", "ARCHIVED"]).optional(),
      scheduledReleaseAt: z.string().optional(),
    }),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("DELETE_SERIES"),
    seriesId: z.string().min(1),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("CREATE_SEASON"),
    seriesId: z.string().min(1),
    seasonNumber: z.number().int().positive(),
    title: z.string().min(1),
    description: z.string().optional(),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("REORDER_SEASONS"),
    seriesId: z.string().min(1),
    seasonOrder: z.array(z.string().min(1)),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("CREATE_EPISODE"),
    seriesId: z.string().min(1),
    seasonId: z.string().min(1),
    episodeNumber: z.number().int().positive(),
    title: z.string().min(1),
    description: z.string().default(""),
    durationMinutes: z.number().nonnegative().default(45),
    videoAssetId: z.string().optional(),
    skipIntroSeconds: z.number().nonnegative().optional(),
    nextEpisodeOffsetSeconds: z.number().nonnegative().optional(),
    ageRatingOverride: z.string().optional(),
    status: z.enum(["DRAFT", "READY", "PUBLISHED", "COMING_SOON"]).default("DRAFT"),
    scheduledReleaseAt: z.string().optional(),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("BULK_CREATE_EPISODES"),
    seriesId: z.string().min(1),
    seasonId: z.string().min(1),
    startNumber: z.number().int().positive().default(1),
    episodes: z.array(
      z.object({
        title: z.string().min(1),
        durationMinutes: z.number().nonnegative().default(45),
        videoAssetId: z.string().optional(),
        skipIntroSeconds: z.number().nonnegative().optional(),
        nextEpisodeOffsetSeconds: z.number().nonnegative().optional(),
        ageRatingOverride: z.string().optional(),
        status: z.enum(["DRAFT", "READY", "PUBLISHED", "COMING_SOON"]).default("DRAFT"),
      })
    ).min(1),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("REORDER_EPISODES"),
    seriesId: z.string().min(1),
    seasonId: z.string().min(1),
    episodeOrder: z.array(z.string().min(1)),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("UPDATE_EPISODE"),
    seriesId: z.string().min(1),
    seasonId: z.string().min(1),
    episodeId: z.string().min(1),
    changes: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      durationMinutes: z.number().optional(),
      videoAssetId: z.string().optional(),
      skipIntroSeconds: z.number().optional(),
      nextEpisodeOffsetSeconds: z.number().optional(),
      ageRatingOverride: z.string().optional(),
      status: z.enum(["DRAFT", "READY", "PUBLISHED", "COMING_SOON"]).optional(),
      scheduledReleaseAt: z.string().optional(),
      episodeNumber: z.number().int().positive().optional(),
    }),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("DELETE_EPISODE"),
    seriesId: z.string().min(1),
    seasonId: z.string().min(1),
    episodeId: z.string().min(1),
    reason: z.string().min(3),
  }),
]);

export const Route = createFileRoute("/api/public/v1/zillionaire/series/")({
  server: {
    handlers: {
      GET: async (event) => {
        try {
          const user = await requireUser(event.request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "content");

          const seriesSnap = await fs.list("series");
          const seriesList: SeriesRecord[] = [];

          for (const doc of seriesSnap) {
            const data = doc.data as any;
            if (!data) continue;

            const seasons = (data.seasons || []) as SeasonRecord[];
            seriesList.push({
              id: doc.id,
              title: data.title || "Untitled Series",
              description: data.description || "",
              channelId: data.channelId || "",
              genre: data.genre || "Drama",
              ageRating: data.ageRating || "13+",
              posterUrl: data.posterUrl,
              backdropUrl: data.backdropUrl,
              trailerUrl: data.trailerUrl,
              cast: data.cast || [],
              crew: data.crew || [],
              status: data.status || "DRAFT",
              scheduledReleaseAt: data.scheduledReleaseAt,
              seasons,
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString(),
            });
          }

          seriesList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

          return Response.json({
            series: seriesList,
            totalSeries: seriesList.length,
            totalSeasons: seriesList.reduce((acc, s) => acc + s.seasons.length, 0),
            totalEpisodes: seriesList.reduce((acc, s) => acc + s.seasons.reduce((eAcc, sn) => eAcc + sn.episodes.length, 0), 0),
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async (event) => {
        try {
          const user = await requireUser(event.request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "content");
          const body = await parseBody(event.request, actionSchema);

          if (body.action === "CREATE_SERIES") {
            const seriesId = `series_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const now = new Date().toISOString();
            const newSeries: Partial<SeriesRecord> = {
              id: seriesId,
              title: body.title,
              description: body.description,
              channelId: body.channelId,
              genre: body.genre,
              ageRating: body.ageRating,
              posterUrl: body.posterUrl,
              backdropUrl: body.backdropUrl,
              trailerUrl: body.trailerUrl,
              cast: body.cast,
              crew: body.crew,
              status: body.status,
              scheduledReleaseAt: body.scheduledReleaseAt,
              seasons: [],
              createdAt: now,
              updatedAt: now,
            };

            await fs.setDoc(`series/${seriesId}`, newSeries);

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "series.create",
              targetType: "series",
              targetId: seriesId,
              reason: body.reason,
              after: newSeries,
            });

            return Response.json({ success: true, series: newSeries });
          }

          if (body.action === "UPDATE_SERIES") {
            const seriesDoc = await fs.getDoc(`series/${body.seriesId}`);
            if (!seriesDoc.exists) {
              throw new ApiError(404, "SERIES_NOT_FOUND", "Series not found.");
            }

            const now = new Date().toISOString();
            const updated = {
              ...seriesDoc.data,
              ...body.changes,
              updatedAt: now,
            };

            await fs.setDoc(`series/${body.seriesId}`, updated, { merge: true });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "series.update",
              targetType: "series",
              targetId: body.seriesId,
              reason: body.reason,
              before: seriesDoc.data,
              after: updated,
            });

            return Response.json({ success: true, series: updated });
          }

          if (body.action === "DELETE_SERIES") {
            const seriesDoc = await fs.getDoc(`series/${body.seriesId}`);
            if (!seriesDoc.exists) {
              throw new ApiError(404, "SERIES_NOT_FOUND", "Series not found.");
            }

            await fs.deleteDoc(`series/${body.seriesId}`);

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "series.delete",
              targetType: "series",
              targetId: body.seriesId,
              reason: body.reason,
              before: seriesDoc.data,
            });

            return Response.json({ success: true, seriesId: body.seriesId });
          }

          if (body.action === "CREATE_SEASON") {
            const seriesDoc = await fs.getDoc(`series/${body.seriesId}`);
            if (!seriesDoc.exists) {
              throw new ApiError(404, "SERIES_NOT_FOUND", "Series not found.");
            }

            const seasons = (seriesDoc.data?.seasons || []) as SeasonRecord[];
            const seasonId = `season_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const newSeason: SeasonRecord = {
              id: seasonId,
              seriesId: body.seriesId,
              seasonNumber: body.seasonNumber,
              title: body.title,
              description: body.description,
              episodes: [],
              createdAt: new Date().toISOString(),
            };

            seasons.push(newSeason);
            seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

            await fs.setDoc(`series/${body.seriesId}`, { seasons, updatedAt: new Date().toISOString() }, { merge: true });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "series.season_create",
              targetType: "series",
              targetId: body.seriesId,
              reason: body.reason,
              after: newSeason,
            });

            return Response.json({ success: true, season: newSeason, seasons });
          }

          if (body.action === "REORDER_SEASONS") {
            const seriesDoc = await fs.getDoc(`series/${body.seriesId}`);
            if (!seriesDoc.exists) {
              throw new ApiError(404, "SERIES_NOT_FOUND", "Series not found.");
            }

            const seasons = (seriesDoc.data?.seasons || []) as SeasonRecord[];
            const seasonMap = new Map(seasons.map((s) => [s.id, s]));
            const reordered: SeasonRecord[] = [];

            body.seasonOrder.forEach((sId, idx) => {
              const s = seasonMap.get(sId);
              if (s) {
                s.seasonNumber = idx + 1;
                reordered.push(s);
                seasonMap.delete(sId);
              }
            });

            // append any leftover
            seasonMap.forEach((s) => {
              s.seasonNumber = reordered.length + 1;
              reordered.push(s);
            });

            await fs.setDoc(`series/${body.seriesId}`, { seasons: reordered, updatedAt: new Date().toISOString() }, { merge: true });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "series.season_reorder",
              targetType: "series",
              targetId: body.seriesId,
              reason: body.reason,
              after: { seasonOrder: body.seasonOrder },
            });

            return Response.json({ success: true, seasons: reordered });
          }

          if (body.action === "CREATE_EPISODE") {
            const seriesDoc = await fs.getDoc(`series/${body.seriesId}`);
            if (!seriesDoc.exists) {
              throw new ApiError(404, "SERIES_NOT_FOUND", "Series not found.");
            }

            const seasons = (seriesDoc.data?.seasons || []) as SeasonRecord[];
            const season = seasons.find((s) => s.id === body.seasonId);
            if (!season) {
              throw new ApiError(404, "SEASON_NOT_FOUND", "Season not found.");
            }

            const now = new Date().toISOString();
            const episodeId = `ep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const newEpisode: EpisodeRecord = {
              id: episodeId,
              seriesId: body.seriesId,
              seasonId: body.seasonId,
              episodeNumber: body.episodeNumber,
              title: body.title,
              description: body.description,
              durationMinutes: body.durationMinutes,
              videoAssetId: body.videoAssetId,
              skipIntroSeconds: body.skipIntroSeconds,
              nextEpisodeOffsetSeconds: body.nextEpisodeOffsetSeconds,
              ageRatingOverride: body.ageRatingOverride,
              status: body.status,
              scheduledReleaseAt: body.scheduledReleaseAt,
              createdAt: now,
              updatedAt: now,
            };

            season.episodes.push(newEpisode);
            season.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

            await fs.setDoc(`series/${body.seriesId}`, { seasons, updatedAt: now }, { merge: true });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "series.episode_create",
              targetType: "series",
              targetId: body.seriesId,
              reason: body.reason,
              after: newEpisode,
            });

            return Response.json({ success: true, episode: newEpisode });
          }

          if (body.action === "BULK_CREATE_EPISODES") {
            const seriesDoc = await fs.getDoc(`series/${body.seriesId}`);
            if (!seriesDoc.exists) {
              throw new ApiError(404, "SERIES_NOT_FOUND", "Series not found.");
            }

            const seasons = (seriesDoc.data?.seasons || []) as SeasonRecord[];
            const season = seasons.find((s) => s.id === body.seasonId);
            if (!season) {
              throw new ApiError(404, "SEASON_NOT_FOUND", "Season not found.");
            }

            const now = new Date().toISOString();
            let currentNum = body.startNumber;
            const createdEpisodes: EpisodeRecord[] = [];

            for (const item of body.episodes) {
              const epId = `ep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${currentNum}`;
              const ep: EpisodeRecord = {
                id: epId,
                seriesId: body.seriesId,
                seasonId: body.seasonId,
                episodeNumber: currentNum,
                title: item.title,
                description: "",
                durationMinutes: item.durationMinutes ?? 45,
                videoAssetId: item.videoAssetId,
                skipIntroSeconds: item.skipIntroSeconds,
                nextEpisodeOffsetSeconds: item.nextEpisodeOffsetSeconds,
                ageRatingOverride: item.ageRatingOverride,
                status: item.status ?? "DRAFT",
                createdAt: now,
                updatedAt: now,
              };
              createdEpisodes.push(ep);
              season.episodes.push(ep);
              currentNum++;
            }

            season.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

            await fs.setDoc(`series/${body.seriesId}`, { seasons, updatedAt: now }, { merge: true });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "series.bulk_episodes_create",
              targetType: "series",
              targetId: body.seriesId,
              reason: body.reason,
              after: { count: createdEpisodes.length, startNumber: body.startNumber },
            });

            return Response.json({ success: true, count: createdEpisodes.length, episodes: createdEpisodes });
          }

          if (body.action === "REORDER_EPISODES") {
            const seriesDoc = await fs.getDoc(`series/${body.seriesId}`);
            if (!seriesDoc.exists) {
              throw new ApiError(404, "SERIES_NOT_FOUND", "Series not found.");
            }

            const seasons = (seriesDoc.data?.seasons || []) as SeasonRecord[];
            const season = seasons.find((s) => s.id === body.seasonId);
            if (!season) {
              throw new ApiError(404, "SEASON_NOT_FOUND", "Season not found.");
            }

            const epMap = new Map(season.episodes.map((e) => [e.id, e]));
            const reordered: EpisodeRecord[] = [];

            body.episodeOrder.forEach((eId, idx) => {
              const ep = epMap.get(eId);
              if (ep) {
                ep.episodeNumber = idx + 1;
                reordered.push(ep);
                epMap.delete(eId);
              }
            });

            epMap.forEach((ep) => {
              ep.episodeNumber = reordered.length + 1;
              reordered.push(ep);
            });

            season.episodes = reordered;

            await fs.setDoc(`series/${body.seriesId}`, { seasons, updatedAt: new Date().toISOString() }, { merge: true });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "series.episode_reorder",
              targetType: "series",
              targetId: body.seriesId,
              reason: body.reason,
              after: { episodeOrder: body.episodeOrder },
            });

            return Response.json({ success: true, episodes: season.episodes });
          }

          if (body.action === "UPDATE_EPISODE") {
            const seriesDoc = await fs.getDoc(`series/${body.seriesId}`);
            if (!seriesDoc.exists) {
              throw new ApiError(404, "SERIES_NOT_FOUND", "Series not found.");
            }

            const seasons = (seriesDoc.data?.seasons || []) as SeasonRecord[];
            const season = seasons.find((s) => s.id === body.seasonId);
            if (!season) {
              throw new ApiError(404, "SEASON_NOT_FOUND", "Season not found.");
            }

            const episode = season.episodes.find((e) => e.id === body.episodeId);
            if (!episode) {
              throw new ApiError(404, "EPISODE_NOT_FOUND", "Episode not found.");
            }

            const now = new Date().toISOString();
            Object.assign(episode, body.changes, { updatedAt: now });

            if (body.changes.episodeNumber) {
              season.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
            }

            await fs.setDoc(`series/${body.seriesId}`, { seasons, updatedAt: now }, { merge: true });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "series.episode_update",
              targetType: "series",
              targetId: body.seriesId,
              reason: body.reason,
              after: episode,
            });

            return Response.json({ success: true, episode });
          }

          if (body.action === "DELETE_EPISODE") {
            const seriesDoc = await fs.getDoc(`series/${body.seriesId}`);
            if (!seriesDoc.exists) {
              throw new ApiError(404, "SERIES_NOT_FOUND", "Series not found.");
            }

            const seasons = (seriesDoc.data?.seasons || []) as SeasonRecord[];
            const season = seasons.find((s) => s.id === body.seasonId);
            if (!season) {
              throw new ApiError(404, "SEASON_NOT_FOUND", "Season not found.");
            }

            const epIdx = season.episodes.findIndex((e) => e.id === body.episodeId);
            if (epIdx === -1) {
              throw new ApiError(404, "EPISODE_NOT_FOUND", "Episode not found.");
            }

            const [deleted] = season.episodes.splice(epIdx, 1);
            await fs.setDoc(`series/${body.seriesId}`, { seasons, updatedAt: new Date().toISOString() }, { merge: true });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "series.episode_delete",
              targetType: "series",
              targetId: body.seriesId,
              reason: body.reason,
              before: deleted,
            });

            return Response.json({ success: true, episodeId: body.episodeId });
          }

          throw new ApiError(400, "INVALID_ACTION", "Unknown series action.");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
