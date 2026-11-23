import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Calendar, Trash2 } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/content-calendar")({
  component: ContentCalendarRoute,
  head: () => ({
    meta: [{ title: "Content Calendar | Zillionaire Control Centre" }],
  }),
});

interface ScheduledRelease {
  id: string;
  title: string;
  type: "movie" | "episode" | "video";
  producerName: string;
  premiereDate: string;
  status: "scheduled" | "live" | "archived";
  contentStatus: string;
}

function ContentCalendarRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="content">
      {({ account, token }) => <ContentCalendarContent account={account} token={token} />}
    </ConsolePageGuard>
  );
}

function ContentCalendarContent({ account, token }: { account: ConsoleAccount; token: string }) {
  const [items, setItems] = useState<ScheduledRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(token);
      const response = await fetch("/api/public/v1/zillionaire/content-assets/?status=ALL", {
        headers,
        cache: "no-store",
      });
      const data = (await response.json()) as {
        assets?: Array<Record<string, unknown>>;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.message || data.error || "Could not load scheduled content.");

      const scheduled = (data.assets ?? []).flatMap((asset): ScheduledRelease[] => {
        const premiere = asset["releaseDate"] ?? asset["scheduledAt"] ?? asset["premiereDate"] ?? asset["publishAt"];
        if (typeof premiere !== "string" || !Number.isFinite(Date.parse(premiere))) return [];
        if (asset["status"] === "DELETED" || asset["deletedAt"]) return [];
        const rawType = String(asset["contentType"] ?? asset["mediaType"] ?? "").toLowerCase();
        const type: ScheduledRelease["type"] =
          rawType.includes("episode") || typeof asset["episodeNumber"] === "number"
            ? "episode"
            : rawType.includes("video") ? "video" : "movie";
        const rawStatus = String(asset["contentStatus"] ?? asset["status"] ?? "").toLowerCase();
        const status: ScheduledRelease["status"] =
          rawStatus === "published" || rawStatus === "active" ? "live" :
          rawStatus === "archived" ? "archived" : "scheduled";
        return [{
          id: String(asset["id"] ?? asset["assetId"] ?? ""),
          title: String(asset["title"] ?? "Untitled content"),
          type,
          producerName: String(asset["producerName"] ?? asset["studioName"] ?? asset["channelId"] ?? "Platform library"),
          premiereDate: premiere,
          status,
          contentStatus: rawStatus,
        }];
      }).filter((item) => item.id);
      setItems(scheduled);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the content calendar.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const removeFakeOrUnwantedItem: EntityAction<ScheduledRelease> = {
    label: "Delete content",
    variant: "destructive",
    icon: Trash2,
    requiresNotes: true,
    onClick: async (item, notes) => {
      const headers = await getWebAuthHeaders(token);
      const response = await fetch("/api/public/v1/zillionaire/content-assets/" + encodeURIComponent(item.id) + "/actions", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", reason: (notes ?? "").trim() }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.message || data.error || "Could not delete this content.");
      await loadItems();
    },
  };

  const columns: EntityColumn<ScheduledRelease>[] = [
    { key: "title", header: "Release Title", render: (item) => <span className="font-bold text-white">{item.title}</span> },
    { key: "type", header: "Content Type", render: (item) => <span className="capitalize text-cyan-300">{item.type}</span> },
    { key: "producerName", header: "Studio / Channel", render: (item) => <span className="text-slate-300">{item.producerName}</span> },
    { key: "premiereDate", header: "Release Date", render: (item) => <span className="font-mono text-xs text-white">{new Date(item.premiereDate).toLocaleString()}</span> },
    { key: "status", header: "Status", render: (item) => <ConsoleStatusBadge status={item.status === "live" ? "active" : item.status === "archived" ? "ARCHIVED" : "pending"} label={item.status} /> },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Content Pipeline & Release Calendar"
      subtitle={error || "Real scheduled movies, episodes and videos from the content library. Demo placeholders are not displayed."}
      icon={Calendar}
      items={items}
      columns={columns}
      idKey="id"
      searchFields={["title", "producerName", "type", "contentStatus"]}
      kpis={[
        { title: "Scheduled Releases", value: items.length, tone: "cyan" },
        { title: "Movies & Videos", value: items.filter((item) => item.type !== "episode").length, tone: "emerald" },
        { title: "Series Episodes", value: items.filter((item) => item.type === "episode").length, tone: "amber" },
      ]}
      tabs={[
        { id: "all", label: "All Releases", filter: () => true },
        { id: "scheduled", label: "Upcoming", filter: (item) => item.status === "scheduled" },
        { id: "live", label: "Published", filter: (item) => item.status === "live" },
      ]}
      detailFields={[
        { label: "Release Title", render: (item) => item.title },
        { label: "Content Format", render: (item) => item.type },
        { label: "Studio / Channel", render: (item) => item.producerName },
        { label: "Release Date", render: (item) => new Date(item.premiereDate).toLocaleString() },
        { label: "Content Status", render: (item) => item.contentStatus || "scheduled" },
      ]}
      actions={[removeFakeOrUnwantedItem]}
      onRefresh={loadItems}
      loading={loading}
    />
  );
}
