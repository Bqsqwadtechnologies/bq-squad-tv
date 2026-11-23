import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/channels/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "channels");

          const url = new URL(request.url);
          const q = url.searchParams.get("q")?.toLowerCase().trim();
          const filter = url.searchParams.get("filter")?.trim();

          const allChannels = await fs.query("channels", { limit: 200 });

          let results = allChannels.filter((channel) => channel["isSystemLibrary"] !== true);

          if (filter && filter !== "ALL") {
            if (filter === "VERIFIED") {
              results = results.filter((c) => Boolean(c["verified"]));
            } else if (filter === "LIVE") {
              results = results.filter((c) => Boolean(c["isLive"]));
            } else if (filter === "SUSPENDED") {
              results = results.filter((c) => c["status"] === "SUSPENDED");
            } else if (filter === "DELETED") {
              results = results.filter((c) => c["status"] === "DELETED" || c["deletedAt"]);
            } else if (filter === "FEATURED") {
              results = results.filter((c) => Boolean(c["featured"]));
            }
          }

          if (q) {
            results = results.filter(
              (c) =>
                (c["title"] as string)?.toLowerCase().includes(q) ||
                (c["handle"] as string)?.toLowerCase().includes(q) ||
                (c["ownerUid"] as string)?.toLowerCase().includes(q) ||
                (c["providerId"] as string)?.toLowerCase().includes(q) ||
                (c["id"] as string)?.toLowerCase().includes(q) ||
                (c["__id"] as string)?.toLowerCase().includes(q),
            );
          }

          return Response.json({
            channels: results.map((c) => {
              const shareBps = typeof c["producerShareBps"] === "number" ? c["producerShareBps"] : 7000;
              return {
                id: c.__id || c["id"],
                title: c["title"] || "Untitled Channel",
                handle: c["handle"] || `@${c.__id || c["id"]}`,
                description: c["description"] || "",
                category: c["category"] || "general",
                logoUrl: c["logoUrl"] || c["posterUrl"] || null,
                deliveryMode: c["deliveryMode"] || "bq_hosted",
                type: c["deliveryMode"] === "external" ? "provider" : "platform",
                ownerUid: c["ownerUid"] || "platform",
                providerId: c["providerId"] || "bq-storage",
                status: c["status"] || (c["published"] ? "ACTIVE" : "DRAFT"),
                published: Boolean(c["published"]),
                verified: Boolean(c["verified"]),
                featured: Boolean(c["featured"]),
                isLive: Boolean(c["isLive"]),
                liveStreamingAllowed: c["liveStreamingAllowed"] !== false,
                monetizationStatus: c["monetizationStatus"] || "enabled",
                producerShareBps: shareBps,
                producerSharePercent: Math.round(shareBps / 100),
                subscribersCount: Number(c["subscribersCount"] || 0),
                videosCount: Number(c["videosCount"] || 0),
                deletedAt: c["deletedAt"] || null,
                suspendedReason: c["suspendedReason"] || null,
                createdAt: c["createdAt"] || null,
                updatedAt: c["updatedAt"] || null,
              };
            }),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
