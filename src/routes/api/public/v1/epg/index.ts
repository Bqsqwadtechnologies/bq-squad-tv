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

          const channels = await fs.query("channels");
          const activeChannels = channels.filter(
            (c: Record<string, unknown>) => String(c["status"] || "").toLowerCase() === "published",
          );

          const scheduleItems = await fs.query("epgSchedule");

          const grid = activeChannels
            .filter((c: Record<string, unknown>) => !channelId || String(c["id"] || c.__id || "") === channelId)
            .map((channel: Record<string, unknown>) => {
              const resolvedChannelId = String(channel["id"] || channel.__id || "");
              const channelPrograms = scheduleItems
                .filter((p: Record<string, unknown>) => p["channelId"] === resolvedChannelId)
                .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
                  String(a["startTime"] ?? "").localeCompare(String(b["startTime"] ?? "")),
                );

              const nowProgram =
                channelPrograms.find((p: Record<string, unknown>) => {
                  const start = new Date(p["startTime"] as string).getTime();
                  const end = new Date(p["endTime"] as string).getTime();
                  const current = now.getTime();
                  return current >= start && current <= end;
                }) ?? null;

              const nextProgram =
                channelPrograms.find((p: Record<string, unknown>) => {
                  const start = new Date(p["startTime"] as string).getTime();
                  return start > now.getTime();
                }) ?? null;

              return {
                channelId: resolvedChannelId,
                channelName: channel["name"] ?? "Channel",
                now: nowProgram,
                next: nextProgram,
                upcoming: channelPrograms.slice(0, 5),
              };
            });

          return Response.json({
            timestamp: now.toISOString(),
            channels: grid,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
