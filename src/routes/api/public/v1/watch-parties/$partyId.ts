import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const partyActionSchema = z.object({
  action: z.enum(["join", "sync", "heartbeat", "chat", "kick", "end"]),
  currentTime: z.number().min(0).optional(),
  playbackState: z.enum(["playing", "paused", "buffering"]).optional(),
  message: z.string().trim().max(500).optional(),
  targetUid: z.string().trim().optional(),
});

export const Route = createFileRoute("/api/public/v1/watch-parties/$partyId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const { partyId } = params;
          const fs = await Firestore.create();
          const party = await fs.getDoc(`watch_parties/${partyId}`);
          if (!party) {
            throw new ApiError(404, "ROOM_NOT_FOUND", "Watch party not found.");
          }

          // Fetch recent chat messages
          const chatDocs = await fs.query(`watch_parties/${partyId}/chat`).catch(() => []);
          const messages = chatDocs
            .sort((a, b) => new Date(String(a["createdAt"] || "")).getTime() - new Date(String(b["createdAt"] || "")).getTime())
            .slice(-50);

          return Response.json({
            ...party,
            chatMessages: messages,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ params, request }) => {
        try {
          const { partyId } = params;
          const user = await requireUser(request);
          const body = await parseBody(request, partyActionSchema);
          const fs = await Firestore.create();

          const party = await fs.getDoc(`watch_parties/${partyId}`);
          if (!party) {
            throw new ApiError(404, "ROOM_NOT_FOUND", "Watch party not found.");
          }
          if (party["status"] === "ended" && body.action !== "chat") {
            throw new ApiError(400, "PARTY_ENDED", "This watch party has already ended.");
          }

          const now = new Date().toISOString();
          const isHost = party["hostUid"] === user.uid;
          const participants = Array.isArray(party["participants"]) ? [...party["participants"]] : [];

          // 1. JOIN
          if (body.action === "join") {
            // Check if kicked
            if (Array.isArray(party["kickedUids"]) && party["kickedUids"].includes(user.uid)) {
              throw new ApiError(403, "KICKED_FROM_PARTY", "You have been removed from this watch party by the host.");
            }

            // Check kids mode / age restriction
            const userProfile = await fs.getDoc(`users/${user.uid}`).catch(() => null);
            const isKids = Boolean(userProfile?.["isUnder18"] || userProfile?.["kidsModeLocked"] || userProfile?.["kidsModeActive"]);
            const restrictedRatings = ["18+", "R", "TV-MA", "NC-17", "ADULT"];
            const contentRating = String(party["contentRating"] || "").toUpperCase();

            if (isKids && restrictedRatings.some((r) => contentRating.includes(r))) {
              throw new ApiError(403, "AGE_RESTRICTED", "Watch party contains age-restricted content blocked by Kids Safe Mode.");
            }

            const maxParticipants = Number(party["maxParticipants"] || 20);
            const existingIndex = participants.findIndex((p) => p.uid === user.uid);

            if (existingIndex < 0) {
              if (participants.length >= maxParticipants) {
                throw new ApiError(400, "ROOM_FULL", `This watch party has reached its limit of ${maxParticipants} participants.`);
              }
              participants.push({
                uid: user.uid,
                email: user.email || "Viewer",
                joinedAt: now,
                billedMinutes: 0,
                lastHeartbeat: now,
                isHost,
              });
            } else {
              participants[existingIndex].lastHeartbeat = now;
            }

            await fs.patchDoc(`watch_parties/${partyId}`, {
              participants,
              updatedAt: now,
            });

            await fs.setDoc(`users/${user.uid}/watch_parties/${partyId}`, {
              partyId,
              roomCode: party["roomCode"],
              title: party["title"],
              role: isHost ? "host" : "viewer",
              updatedAt: now,
            });

            return Response.json({ success: true, message: "Joined watch party successfully.", party: { ...party, participants } });
          }

          // 2. SYNC (Host only play/pause/seek)
          if (body.action === "sync") {
            if (!isHost) {
              throw new ApiError(403, "HOST_ONLY", "Only the host can sync playback controls.");
            }

            const patch: Record<string, unknown> = { updatedAt: now };
            if (body.currentTime !== undefined) patch["currentTime"] = body.currentTime;
            if (body.playbackState) patch["playbackState"] = body.playbackState;

            await fs.patchDoc(`watch_parties/${partyId}`, patch);

            return Response.json({ success: true, currentTime: body.currentTime, playbackState: body.playbackState });
          }

          // 3. HEARTBEAT (Billed watch minutes independently for every participant)
          if (body.action === "heartbeat") {
            const index = participants.findIndex((p) => p.uid === user.uid);
            if (index >= 0) {
              const currentBilled = Number(participants[index].billedMinutes || 0);
              // Heartbeat received approximately every 60s
              participants[index].billedMinutes = currentBilled + 1;
              participants[index].lastHeartbeat = now;

              await fs.patchDoc(`watch_parties/${partyId}`, {
                participants,
                updatedAt: now,
              });

              // Log independent watch billing record for this participant
              await fs.setDoc(`watch_party_billing/${partyId}_${user.uid}`, {
                partyId,
                uid: user.uid,
                totalMinutesBilled: participants[index].billedMinutes,
                updatedAt: now,
              });
            }

            return Response.json({
              success: true,
              billedMinutes: index >= 0 ? participants[index].billedMinutes : 0,
            });
          }

          // 4. CHAT
          if (body.action === "chat") {
            if (!body.message) {
              throw new ApiError(400, "MISSING_MESSAGE", "Message body is required.");
            }
            const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const chatMsg = {
              id: msgId,
              senderUid: user.uid,
              senderName: user.email?.split("@")[0] || "Viewer",
              isHost,
              message: body.message,
              createdAt: now,
            };

            await fs.setDoc(`watch_parties/${partyId}/chat/${msgId}`, chatMsg);

            return Response.json({ success: true, message: chatMsg });
          }

          // 5. KICK (Host only)
          if (body.action === "kick") {
            if (!isHost) {
              throw new ApiError(403, "HOST_ONLY", "Only the party host can kick participants.");
            }
            if (!body.targetUid) {
              throw new ApiError(400, "MISSING_TARGET", "targetUid is required to kick.");
            }
            if (body.targetUid === user.uid) {
              throw new ApiError(400, "INVALID_TARGET", "Host cannot kick themselves.");
            }

            const updatedParticipants = participants.filter((p) => p.uid !== body.targetUid);
            const kickedUids = Array.isArray(party["kickedUids"]) ? [...party["kickedUids"]] : [];
            if (!kickedUids.includes(body.targetUid)) {
              kickedUids.push(body.targetUid);
            }

            await fs.patchDoc(`watch_parties/${partyId}`, {
              participants: updatedParticipants,
              kickedUids,
              updatedAt: now,
            });

            return Response.json({ success: true, message: "Participant kicked." });
          }

          // 6. END (Host only)
          if (body.action === "end") {
            if (!isHost) {
              throw new ApiError(403, "HOST_ONLY", "Only the party host can end the room.");
            }

            await fs.patchDoc(`watch_parties/${partyId}`, {
              status: "ended",
              endedAt: now,
              updatedAt: now,
            });

            return Response.json({ success: true, message: "Watch party ended." });
          }

          throw new ApiError(400, "INVALID_ACTION", "Unknown watch party action.");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
