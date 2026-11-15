import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";

function amount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export const Route = createFileRoute("/api/public/v1/producer/mobile-summary")({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const fs = await Firestore.create();
      await requirePlatformRole(fs, user, "producer");
      const [producer, channels] = await Promise.all([
        fs.getDoc("producers/" + user.uid),
        fs.query("channels", { filters: [{ field: "ownerUid", op: "EQUAL", value: user.uid }], limit: 100 }),
      ]);
      return Response.json({
        producerStatus: typeof producer?.["planStatus"] === "string" ? producer["planStatus"] : "UNKNOWN",
        earningsBalanceMinor: amount(producer?.["earningsBalanceMinor"]),
        earningsLifetimeMinor: amount(producer?.["earningsLifetimeMinor"]),
        currency: "NGN",
        channelCount: channels.length,
        publishedChannelCount: channels.filter(channel => channel["published"] === true).length,
        channels: channels.slice(0, 20).map(channel => ({
          id: channel.__id,
          title: typeof channel["title"] === "string" ? channel["title"] : "Untitled channel",
          status: typeof channel["status"] === "string" ? channel["status"] : (channel["published"] === true ? "PUBLISHED" : "DRAFT"),
        })),
      });
    } catch (error) { return errorBody(error); }
  } } },
});
