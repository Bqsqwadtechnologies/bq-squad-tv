import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { signPlaybackToken } from "@/lib/server/storage/security";
import { loadStreamStorageConfiguration } from "@/lib/server/storage/transfers";
import {
  estimateExpectedPlaybackBytes,
  reserveExpectedStorageEgress,
  releaseExpectedStorageEgress,
} from "@/lib/server/storage/expected-egress";
import { requireSessionOwned } from "../../-shared";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const bodySchema = z.object({
  failedDestinationId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
});

export const Route = createFileRoute("/api/public/v1/sessions/$sessionId/replica/next")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const sessionId = params.sessionId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(sessionId))
            throw new ApiError(400, "SESSION_INVALID", "The playback session is invalid.");
          const body = bodySchema.parse(await request.json());
          const fs = await Firestore.create();
          await enforceRateLimit(fs, "replica-next:" + sessionId, { limit: 4, windowMs: 60_000 });
          const session = requireSessionOwned(
            await fs.getDoc("sessions/" + sessionId),
            sessionId,
            user.uid,
          );
          if (
            session["active"] !== true ||
            session["streamDestinationId"] !== body.failedDestinationId
          ) {
            throw new ApiError(
              409,
              "REPLICA_FAILOVER_STALE",
              "The playback location has already changed.",
            );
          }
          const assetId =
            typeof session["contentAssetId"] === "string" ? session["contentAssetId"] : "";
          const asset = await fs.getDoc("contentAssets/" + assetId);
          if (!asset || asset["status"] !== "ready")
            throw new ApiError(
              404,
              "STREAM_ASSET_UNAVAILABLE",
              "This title is not available right now.",
            );
          const storagePath =
            typeof session["storagePath"] === "string" ? session["storagePath"] : "";
          const sequence =
            typeof session["replicaSequence"] === "number" ? session["replicaSequence"] + 1 : 1;
          const configuration = await loadStreamStorageConfiguration(
            fs,
            asset,
            assetId,
            sessionId + ":replica:" + sequence,
            [body.failedDestinationId],
          );
          if (
            configuration.configurationStatus !== "configured" ||
            !configuration.metadata.enabled ||
            configuration.metadata.mode !== "active" ||
            configuration.metadata.healthStatus !== "healthy" ||
            configuration.metadata.paidEgressEnabled === true
          ) {
            throw new ApiError(
              503,
              "STREAM_REPLICAS_UNAVAILABLE",
              "This title is busy right now. Try again shortly.",
            );
          }
          const bitrate =
            typeof session["streamBitrateBps"] === "number"
              ? session["streamBitrateBps"]
              : 1_500_000;
          const expectedBytes = estimateExpectedPlaybackBytes({
            ...asset,
            streamBitrateBps: bitrate,
          });
          const reservationId = sessionId + "-replica-" + sequence;
          await reserveExpectedStorageEgress(
            fs,
            configuration.metadata,
            reservationId,
            expectedBytes,
          );
          const now = Math.floor(Date.now() / 1000);
          const token = await signPlaybackToken({
            sid: sessionId,
            uid: user.uid,
            path: storagePath,
            iat: now,
            exp: now + 900,
          });
          const playbackUrl = new URL(
            "/api/public/v1/streaming/hls/" +
              storagePath.split("/").map(encodeURIComponent).join("/") +
              "?sid=" +
              encodeURIComponent(sessionId) +
              "&token=" +
              encodeURIComponent(token),
            request.url,
          ).toString();
          const previousReservation =
            typeof session["storageEgressReservationId"] === "string"
              ? session["storageEgressReservationId"]
              : "";
          try {
            await fs.patchDoc("sessions/" + sessionId, {
              streamDestinationId: configuration.metadata.destinationId,
              replicaId: configuration.metadata.destinationId,
              replicaSequence: sequence,
              storageEgressReservationId: reservationId,
              storageEgressGroupId: configuration.metadata.accountGroup,
              playbackUrl,
              replicaChangedAt: new Date().toISOString(),
            });
          } catch (error) {
            await releaseExpectedStorageEgress(fs, reservationId).catch(() => undefined);
            throw error;
          }
          if (previousReservation)
            await releaseExpectedStorageEgress(fs, previousReservation).catch(() => undefined);
          return Response.json(
            { playbackUrl, replicaId: configuration.metadata.destinationId, sequence },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
