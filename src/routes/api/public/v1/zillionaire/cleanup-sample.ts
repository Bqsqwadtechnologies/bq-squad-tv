import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import crypto from "crypto";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { requireStepUp } from "@/lib/server/zillionaire-access";
import { rebuildStoragePoolIndex } from "@/lib/server/storage/pool-index";

const bodySchema = z.object({
  dryRun: z.boolean().default(true),
  scope: z.enum(["fake_live_streams", "all_sample_content"]).default("fake_live_streams"),
  confirmation: z.string().optional(),
  reason: z.string().trim().min(5).max(1000).optional(),
});

type SampleItem = {
  collection: string;
  id: string;
  title: string;
  reason: string;
  sizeBytes?: number;
};

function isKnownPlaceholderStream(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" ||
      host.endsWith(".test") || host === "example.com" || host.endsWith(".example.com") ||
      host.endsWith(".invalid") || path.split("/").some((part) => part === "demo" || part === "sample" || part === "test") ||
      /(?:demo|sample|test)[-_]?stream/.test(host);
  } catch {
    return false;
  }
}
export const Route = createFileRoute("/api/public/v1/zillionaire/cleanup-sample")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, bodySchema);
          const fs = await Firestore.create();

          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner) {
            throw new ApiError(
              403,
              "OWNER_ONLY",
              "Only the platform owner can inspect or clean up sample content.",
            );
          }

          if (!body.dryRun) {
            requireStepUp(request, user.uid, "permanent_delete");
            if (body.confirmation !== "DELETE_SAMPLE_CONTENT") {
              throw new ApiError(
                400,
                "INVALID_CONFIRMATION",
                "Typed confirmation must match DELETE_SAMPLE_CONTENT exactly.",
              );
            }
            if (!body.reason || body.reason.trim().length < 5) {
              throw new ApiError(
                400,
                "REASON_REQUIRED",
                "A mandatory reason of at least 5 characters is required for permanent deletion.",
              );
            }
          }

          const sampleItems: SampleItem[] = [];
          let estimatedBytesFreed = 0;

          // 1. Channels
          const channels = await fs.query("channels", { limit: 500 }).catch(() => []);
          const channelsToDelete: string[] = [];
          const assetsToDelete: string[] = [];
          const seriesToDelete: string[] = [];
          const episodesToDelete: string[] = [];
          const storageDestinationsToDelete: string[] = [];
          const storageObjectsToDelete: string[] = [];
          for (const ch of channels) {
            const id = ch.__id;
            const title = String(ch["name"] || ch["title"] || "");
            const hasPlaceholderStream =
              isKnownPlaceholderStream(ch["streamUrl"]) ||
              isKnownPlaceholderStream(ch["failoverStreamUrl"]);
            const isSeededChannel =
              id.startsWith("demo") ||
              id.startsWith("sample-") ||
              ch["isDemo"] === true ||
              ch["isSample"] === true ||
              ch["seed"] === true ||
              ch["isSeeded"] === true ||
              /demo channel|bq sqwad sports hd/i.test(title);
            const isLiveRecord =
              ch["deliveryMode"] === "live_hls" ||
              ch["channelType"] === "live" ||
              ch["channelType"] === "live_tv" ||
              Boolean(ch["streamUrl"]) ||
              Boolean(ch["failoverStreamUrl"]);
            const isDemo = body.scope === "fake_live_streams"
              ? hasPlaceholderStream || (isSeededChannel && isLiveRecord)
              : isSeededChannel || hasPlaceholderStream;

            if (isDemo) {
              channelsToDelete.push(id);
              sampleItems.push({
                collection: "channels",
                id,
                title: title || id,
                reason: isKnownPlaceholderStream(ch["streamUrl"]) || isKnownPlaceholderStream(ch["failoverStreamUrl"])
                  ? "Known placeholder/test live-stream URL"
                  : "Demo/seeded channel fixture",
              });
            }
          }

          if (body.scope === "all_sample_content") {
          // 2. Content Assets
          const contentAssets = await fs.query("contentAssets", { limit: 500 }).catch(() => []);
          for (const asset of contentAssets) {
            const id = asset.__id;
            const title = String(asset["title"] || asset["name"] || "");
            const uploaderUid = String(asset["uploaderUid"] || "");
            const size = Number(asset["sizeBytes"] || asset["fileSize"] || 0);

            const isSample =
              id.startsWith("demo") ||
              id.startsWith("sample-") ||
              asset["isDemo"] === true ||
              asset["isSample"] === true ||
              asset["seed"] === true ||
              asset["isSeeded"] === true ||
              uploaderUid === "system_seed" ||
              (/lagos nights|abidjan hustle|golden savannah|super eagles: african kings/i.test(title) &&
                (uploaderUid === "system" || !uploaderUid));

            if (isSample) {
              assetsToDelete.push(id);
              const bytes = size > 0 ? size : 52_428_800; // estimated 50MB default
              estimatedBytesFreed += bytes;
              sampleItems.push({
                collection: "contentAssets",
                id,
                title: title || id,
                reason: "Sample media fixture without authentic uploader",
                sizeBytes: bytes,
              });
            }
          }

          // 3. Series
          const series = await fs.query("series", { limit: 500 }).catch(() => []);
          for (const s of series) {
            const id = s.__id;
            const title = String(s["title"] || s["name"] || "");
            const isSample =
              id.startsWith("demo") ||
              id.startsWith("sample-") ||
              s["isDemo"] === true ||
              s["seed"] === true ||
              s["isSample"] === true;
            if (isSample) {
              seriesToDelete.push(id);
              sampleItems.push({
                collection: "series",
                id,
                title: title || id,
                reason: "Sample series fixture",
              });
            }
          }

          // 4. Episodes
          const episodes = await fs.query("episodes", { limit: 500 }).catch(() => []);
          for (const ep of episodes) {
            const id = ep.__id;
            const title = String(ep["title"] || ep["name"] || "");
            const isSample =
              id.startsWith("demo") ||
              id.startsWith("sample-") ||
              ep["isDemo"] === true ||
              ep["seed"] === true ||
              ep["isSample"] === true;
            if (isSample) {
              episodesToDelete.push(id);
              sampleItems.push({
                collection: "episodes",
                id,
                title: title || id,
                reason: "Sample episode fixture",
              });
            }
          }

          // 5. Storage Destinations
          const destinations = await fs.query("storageDestinations", { limit: 500 }).catch(() => []);
          for (const dest of destinations) {
            const id = dest.__id;
            const isSample =
              id.startsWith("demo") ||
              id.startsWith("sample-") ||
              dest["isDemo"] === true ||
              dest["seed"] === true;
            if (isSample) {
              storageDestinationsToDelete.push(id);
              sampleItems.push({
                collection: "storageDestinations",
                id,
                title: String(dest["accountAlias"] || id),
                reason: "Seeded mock storage destination",
              });
            }
          }

          // 6. Storage Objects
          const storageObjects = await fs.query("storageObjects", { limit: 500 }).catch(() => []);
          for (const obj of storageObjects) {
            const id = obj.__id;
            const size = Number(obj["sizeBytes"] || obj["contentLength"] || 0);
            const isSample =
              id.startsWith("demo") ||
              id.startsWith("sample-") ||
              obj["isDemo"] === true ||
              obj["seed"] === true ||
              obj["isSample"] === true;
            if (isSample) {
              storageObjectsToDelete.push(id);
              if (size > 0) estimatedBytesFreed += size;
              sampleItems.push({
                collection: "storageObjects",
                id,
                title: String(obj["path"] || id),
                reason: "Sample storage artifact",
                sizeBytes: size,
              });
            }
          }

          }

          const totalRecordsFound =
            channelsToDelete.length +
            assetsToDelete.length +
            seriesToDelete.length +
            episodesToDelete.length +
            storageDestinationsToDelete.length +
            storageObjectsToDelete.length;

          if (body.dryRun) {
            return Response.json({
              dryRun: true,
              totalRecordsFound,
              channelsFound: channelsToDelete.length,
              contentAssetsFound: assetsToDelete.length,
              seriesFound: seriesToDelete.length,
              episodesFound: episodesToDelete.length,
              storageDestinationsFound: storageDestinationsToDelete.length,
              storageObjectsFound: storageObjectsToDelete.length,
              estimatedBytesFreed,
              sampleItems,
            });
          }

          // Execute deletion
          for (const id of channelsToDelete) {
            await fs.deleteDoc(`channels/${id}`).catch(() => {});
          }
          for (const id of assetsToDelete) {
            await fs.deleteDoc(`contentAssets/${id}`).catch(() => {});
          }
          for (const id of seriesToDelete) {
            await fs.deleteDoc(`series/${id}`).catch(() => {});
          }
          for (const id of episodesToDelete) {
            await fs.deleteDoc(`episodes/${id}`).catch(() => {});
          }
          for (const id of storageDestinationsToDelete) {
            await fs.deleteDoc(`storageDestinations/${id}`).catch(() => {});
          }
          for (const id of storageObjectsToDelete) {
            await fs.deleteDoc(`storageObjects/${id}`).catch(() => {});
          }

          if (storageDestinationsToDelete.length > 0) {
            await rebuildStoragePoolIndex(fs).catch(() => {});
          }

          const reportId = `cleanup_rep_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
          const now = new Date().toISOString();

          await fs.set(`sampleCleanupReports/${reportId}`, {
            reportId,
            executedBy: user.uid,
            reason: body.reason,
            executedAt: now,
            channelsDeleted: channelsToDelete.length,
            contentAssetsDeleted: assetsToDelete.length,
            seriesDeleted: seriesToDelete.length,
            episodesDeleted: episodesToDelete.length,
            storageDestinationsDeleted: storageDestinationsToDelete.length,
            storageObjectsDeleted: storageObjectsToDelete.length,
            totalRecordsDeleted: totalRecordsFound,
            estimatedBytesFreed,
            deletedItems: sampleItems,
          }).catch(() => {});

          const auditId = `audit_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
          await fs.set(`auditLog/${auditId}`, {
            action: "CLEANUP_SAMPLE_CONTENT",
            actorUid: user.uid,
            targetType: "system",
            targetId: reportId,
            reason: body.reason,
            metadata: {
              reportId,
              totalRecordsDeleted: totalRecordsFound,
              channelsDeleted: channelsToDelete.length,
              contentAssetsDeleted: assetsToDelete.length,
              seriesDeleted: seriesToDelete.length,
              episodesDeleted: episodesToDelete.length,
              storageObjectsDeleted: storageObjectsToDelete.length,
              estimatedBytesFreed,
            },
            createdAt: now,
          }).catch(() => {});

          return Response.json({
            dryRun: false,
            success: true,
            reportId,
            totalRecordsDeleted: totalRecordsFound,
            channelsDeleted: channelsToDelete.length,
            contentAssetsDeleted: assetsToDelete.length,
            seriesDeleted: seriesToDelete.length,
            episodesDeleted: episodesToDelete.length,
            storageDestinationsDeleted: storageDestinationsToDelete.length,
            storageObjectsDeleted: storageObjectsToDelete.length,
            estimatedBytesFreed,
            executedAt: now,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
