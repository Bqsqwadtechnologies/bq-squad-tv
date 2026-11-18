import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/epg/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const channelId = url.searchParams.get("channelId");
          const fs = await Firestore.create();

          const now = new Date();
          const channels = await fs.listDocs("channels");
          const activeChannels = channels.filter((c) => c["status"] === "published");

          const scheduleItems = await fs.listDocs("epgSchedule");

          const grid = activeChannels
            .filter((c) => !channelId || c["id"] === channelId)
            .map((channel) => {
              const channelPrograms = scheduleItems
                .filter((p) => p["channelId"] === channel["id"])
                .sort((a, b) => String(a["startTime"] ?? "").localeCompare(String(b["startTime"] ?? "")));

              const nowProgram = channelPrograms.find((p) => {
                const start = new Date(p["startTime"] as string).getTime();
                const end = new Date(p["endTime"] as string).getTime();
                const current = now.getTime();
                return current >= start && current <= end;
              }) ?? null;

              const nextProgram = channelPrograms.find((p) => {
                const start = new Date(p["startTime"] as string).getTime();
                return start > now.getTime();
              }) ?? null;

              return {
                channelId: channel["id"],
                channelName: channel["name"] ?? channel["title"] ?? "Live Channel",
                now: nowProgram,
                next: nextProgram,
                schedule: channelPrograms.slice(0, 10),
              };
            });

          return Response.json({ channels: grid });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
