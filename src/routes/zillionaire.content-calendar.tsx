import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Calendar, Film, Radio, Sparkles, Clock } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/content-calendar")({
  component: ContentCalendarRoute,
  head: () => ({
    meta: [{ title: "Content Calendar | Zillionaire Control Centre" }],
  }),
});

interface ScheduledRelease {
  id: string;
  title: string;
  type: "movie" | "episode" | "live_event";
  producerName: string;
  premiereDate: string;
  embargoUntil?: string;
  status: "scheduled" | "embargoed" | "live" | "archived";
}

const mockReleases: ScheduledRelease[] = [
  {
    id: "rel_01",
    title: "Battle of the Titans: Live Championship",
    type: "live_event",
    producerName: "Prime Sports Africa",
    premiereDate: "2026-03-28T18:00:00Z",
    status: "scheduled",
  },
  {
    id: "rel_02",
    title: "Lagos Nights: Underground Season 2",
    type: "episode",
    producerName: "Silverbird Studios",
    premiereDate: "2026-04-01T00:00:00Z",
    embargoUntil: "2026-03-31T23:59:59Z",
    status: "embargoed",
  },
  {
    id: "rel_03",
    title: "The Billionaire's Secret",
    type: "movie",
    producerName: "Nollywood Premium",
    premiereDate: "2026-03-25T10:00:00Z",
    status: "live",
  },
];

function ContentCalendarRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="content">
      {(account) => <ContentCalendarContent account={account} />}
    </ConsolePageGuard>
  );
}

function ContentCalendarContent({ account }: { account: ConsoleAccount }) {
  const [items] = useState<ScheduledRelease[]>(mockReleases);

  const columns: EntityColumn<ScheduledRelease>[] = [
    { key: "title", header: "Release Title", render: (r) => <span className="font-bold text-white">{r.title}</span> },
    { key: "type", header: "Content Type", render: (r) => <span className="capitalize text-cyan-300">{r.type.replace(/_/g, " ")}</span> },
    { key: "producer", header: "Studio / Producer", render: (r) => <span className="text-slate-300">{r.producerName}</span> },
    { key: "premiere", header: "Scheduled Premiere", render: (r) => <span className="font-mono text-xs text-white">{new Date(r.premiereDate).toLocaleString()}</span> },
    { key: "status", header: "Status", render: (r) => <ConsoleStatusBadge status={r.status === "live" ? "active" : "pending"} label={r.status} /> },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Content Pipeline & Release Calendar"
      subtitle="Schedule upcoming premieres, coordinate live broadcast events, and enforce distribution embargo dates."
      icon={Calendar}
      items={items}
      columns={columns}
      idKey="id"
      searchFields={["title", "producerName", "type"]}
      kpis={[
        { title: "Total Scheduled", value: items.length, tone: "cyan" },
        { title: "Upcoming Live Events", value: items.filter((r) => r.type === "live_event").length, tone: "emerald" },
        { title: "Embargoed Titles", value: items.filter((r) => r.status === "embargoed").length, tone: "amber" },
      ]}
      tabs={[
        { id: "all", label: "All Releases", filter: () => true },
        { id: "scheduled", label: "Upcoming", filter: (r) => r.status === "scheduled" || r.status === "embargoed" },
        { id: "live", label: "Currently Live", filter: (r) => r.status === "live" },
      ]}
      detailFields={[
        { label: "Release Title", render: (r) => r.title },
        { label: "Content Format", render: (r) => r.type },
        { label: "Producer / Network", render: (r) => r.producerName },
        { label: "Premiere Window", render: (r) => new Date(r.premiereDate).toLocaleString() },
        { label: "Public Press Embargo", render: (r) => r.embargoUntil ? `Strictly embargoed until ${new Date(r.embargoUntil).toLocaleString()}` : "No embargo" },
      ]}
    />
  );
}
