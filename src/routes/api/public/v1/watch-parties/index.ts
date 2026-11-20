import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const createPartySchema = z.object({
  targetType: z.enum(["movie", "series", "episode", "channel", "live_stream"]),
  targetId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  posterUrl: z.string().nullable().optional(),
  streamUrl: z.string().nullable().optional(),
  contentRating: z.string().trim().optional(),
  maxParticipants: z.number().int().min(2).max(100).default(20),
});

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const Route = createFileRoute("/api/public/v1/watch-parties/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const code = url.searchParams.get("code")?.trim().toUpperCase();
          const partyId = url.searchParams.get("partyId")?.trim();

          const fs = await Firestore.create();

          if (code) {
            const indexDoc = await fs.getDoc(`watch_party_codes/${code}`);
            if (!indexDoc?.["partyId"]) {
              throw new ApiError(404, "ROOM_NOT_FOUND", "No active watch party found with this room code.");
            }
            const party = await fs.getDoc(`watch_parties/${indexDoc["partyId"]}`);
            if (!party || party["status"] === "ended") {
              throw new ApiError(404, "ROOM_ENDED", "This watch party has ended.");
            }
            return Response.json(party);
          }

          if (partyId) {
            const party = await fs.getDoc(`watch_parties/${partyId}`);
            if (!party) {
              throw new ApiError(404, "ROOM_NOT_FOUND", "Watch party not found.");
            }
            return Response.json(party);
          }

          const user = await requireUser(request);
          // Return user active parties
          const userParties = await fs.listDocs(`users/${user.uid}/watch_parties`).catch(() => []);
          return Response.json(userParties.map((d) => d.data));
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, createPartySchema);
          const fs = await Firestore.create();

          // Check kids mode / age restriction
          const userProfile = await fs.getDoc(`users/${user.uid}`).catch(() => null);
          const isKids = Boolean(userProfile?.["isUnder18"] || userProfile?.["kidsModeLocked"] || userProfile?.["kidsModeActive"]);
          const restrictedRatings = ["18+", "R", "TV-MA", "NC-17", "ADULT"];
          const contentRating = (body.contentRating || "").toUpperCase();

          if (isKids && restrictedRatings.some((r) => contentRating.includes(r))) {
            throw new ApiError(403, "AGE_RESTRICTED", "Watch party contains age-restricted content blocked by Kids Safe Mode.");
          }

          const partyId = `party_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const roomCode = generateRoomCode();
          const now = new Date().toISOString();

          const partyData = {
            id: partyId,
            roomCode,
            hostUid: user.uid,
            hostEmail: user.email || "host",
            title: body.title,
            targetType: body.targetType,
            targetId: body.targetId,
            posterUrl: body.posterUrl || null,
            streamUrl: body.streamUrl || null,
            contentRating: body.contentRating || "G",
            maxParticipants: body.maxParticipants,
            playbackState: "paused",
            currentTime: 0,
            status: "active",
            createdAt: now,
            updatedAt: now,
            participants: [
              {
                uid: user.uid,
                email: user.email || "Host",
                joinedAt: now,
                billedMinutes: 0,
                lastHeartbeat: now,
                isHost: true,
              },
            ],
          };

          await fs.setDoc(`watch_parties/${partyId}`, partyData);
          await fs.setDoc(`watch_party_codes/${roomCode}`, { partyId, createdAt: now });
          await fs.setDoc(`users/${user.uid}/watch_parties/${partyId}`, {
            partyId,
            roomCode,
            title: body.title,
            role: "host",
            createdAt: now,
          });

          return Response.json({
            success: true,
            party: partyData,
            shareUrl: `/watch-party/${partyId}?code=${roomCode}`,
            deepLink: `bqsqwad://party/${partyId}?code=${roomCode}`,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
