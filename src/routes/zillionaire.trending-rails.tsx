import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid, ArrowUp, ArrowDown, Pin, Eye, Sparkles } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/trending-rails")({
  component: TrendingRailsRoute,
  head: () => ({
    meta: [{ title: "Trending & Rails Editor | Zillionaire Control Centre" }],
  }),
});

interface HomepageRail {
  id: string;
  title: string;
  railType: "algorithmic_trending" | "curated_collection" | "live_tv_spotlight" | "category_feed";
  displayOrder: number;
  itemCount: number;
  active: boolean;
  targetAudience: "all" | "kids_safe" | "subscribers";
}

const mockRails: HomepageRail[] = [
  {
    id: "rail_01",
    title: "Trending in Nigeria Now",
    railType: "algorithmic_trending",
    displayOrder: 1,
    itemCount: 12,
    active: true,
    targetAudience: "all",
  },
  {
    id: "rail_02",
    title: "Nollywood Blockbusters",
    railType: "curated_collection",
    displayOrder: 2,
    itemCount: 8,
    active: true,
    targetAudience: "all",
  },
  {
    id: "rail_03",
    title: "Live 24/7 Broadcast Channels",
    railType: "live_tv_spotlight",
    displayOrder: 3,
    itemCount: 6,
    active: true,
    targetAudience: "all",
  },
  {
    id: "rail_04",
    title: "Family & Kids Safe Zone",
    railType: "category_feed",
    displayOrder: 4,
    itemCount: 15,
    active: true,
    targetAudience: "kids_safe",
  },
];

function TrendingRailsRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="content">
      {(account) => <TrendingRailsContent account={account} />}
    </ConsolePageGuard>
  );
}

function TrendingRailsContent({ account }: { account: ConsoleAccount }) {
  const [rails, setRails] = useState<HomepageRail[]>(mockRails);

  const columns: EntityColumn<HomepageRail>[] = [
    { key: "order", header: "Order", render: (r) => <span className="font-mono font-bold text-cyan-400">#{r.displayOrder}</span> },
    { key: "title", header: "Rail Headline", render: (r) => <span className="font-bold text-white">{r.title}</span> },
    { key: "type", header: "Rail Type", render: (r) => <span className="capitalize text-slate-300">{r.railType.replace(/_/g, " ")}</span> },
    { key: "items", header: "Cards Count", render: (r) => <span className="font-mono text-slate-300">{r.itemCount} titles</span> },
    { key: "audience", header: "Audience Filter", render: (r) => <span className="capitalize text-xs text-cyan-300">{r.targetAudience.replace(/_/g, " ")}</span> },
    { key: "status", header: "Status", render: (r) => <ConsoleStatusBadge status={r.active ? "active" : "inactive"} label={r.active ? "Live" : "Hidden"} /> },
  ];

  const actions: EntityAction<HomepageRail>[] = [
    {
      label: "Toggle Visibility",
      variant: "primary",
      onClick: (item) => {
        setRails((prev) => prev.map((r) => r.id === item.id ? { ...r, active: !r.active } : r));
      },
    },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Homepage Rails & Trending Editor"
      subtitle="Curate discovery carousel rails, order featured showcases, and customize audience-specific feeds."
      icon={LayoutGrid}
      items={rails}
      columns={columns}
      idKey="id"
      searchFields={["title", "railType"]}
      kpis={[
        { title: "Active Rails", value: rails.filter((r) => r.active).length, tone: "cyan" },
        { title: "Total Showcases", value: rails.length, tone: "emerald" },
      ]}
      tabs={[
        { id: "all", label: "All Rails", filter: () => true },
        { id: "active", label: "Active Live", filter: (r) => r.active },
      ]}
      actions={actions}
      detailFields={[
        { label: "Rail Display Order", render: (r) => `Position #${r.displayOrder}` },
        { label: "Public Rail Headline", render: (r) => r.title },
        { label: "Content Sourcing Engine", render: (r) => r.railType.replace(/_/g, " ").toUpperCase() },
        { label: "Target Audience Restrictions", render: (r) => r.targetAudience },
      ]}
    />
  );
}
