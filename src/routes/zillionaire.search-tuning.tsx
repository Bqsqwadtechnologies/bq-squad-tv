import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Pin, Sparkles, TrendingUp, Tag } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/search-tuning")({
  component: SearchTuningRoute,
  head: () => ({
    meta: [{ title: "Search Tuning & Synonyms | Zillionaire Control Centre" }],
  }),
});

interface SearchTuningRule {
  id: string;
  queryTerm: string;
  synonyms: string[];
  pinnedAssetId?: string;
  pinnedAssetTitle?: string;
  boostMultiplier: number;
  active: boolean;
  searchesThisWeek: number;
}


function SearchTuningRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="catalog">
      {({ account }) => <SearchTuningContent account={account} />}
    </ConsolePageGuard>
  );
}

function SearchTuningContent({ account }: { account: ConsoleAccount }) {
  const [rules, setRules] = useState<SearchTuningRule[]>([]);

  const columns: EntityColumn<SearchTuningRule>[] = [
    { key: "term", header: "Search Term", render: (s) => <span className="font-bold text-cyan-400">"{s.queryTerm}"</span> },
    { key: "synonyms", header: "Mapped Synonyms", render: (s) => <span className="text-slate-300 text-xs">{s.synonyms.join(", ")}</span> },
    { key: "pinned", header: "Pinned Top Result", render: (s) => <span className="text-white text-xs">{s.pinnedAssetTitle || "Algorithmic"}</span> },
    { key: "boost", header: "Boost Multiplier", render: (s) => <span className="font-mono text-emerald-400 font-bold">{s.boostMultiplier}x</span> },
    { key: "volume", header: "Weekly Volume", render: (s) => <span className="font-mono text-slate-300">{s.searchesThisWeek.toLocaleString()}</span> },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Search Relevance & Synonym Tuning"
      subtitle="Define query synonyms, pin top priority titles, and tune algorithmic discovery weights. No live records are available from a connected service yet; sample data is intentionally not shown."
      icon={Search}
      items={rules}
      columns={columns}
      idKey="id"
      searchFields={["queryTerm", "pinnedAssetTitle"]}
      kpis={[
        { title: "Tuned Query Terms", value: rules.length, tone: "cyan" },
        { title: "Pinned Top Results", value: rules.filter((s) => s.pinnedAssetId).length, tone: "emerald" },
        { title: "Weekly Search Hits", value: rules.reduce((s, r) => s + r.searchesThisWeek, 0), tone: "primary" },
      ]}
      tabs={[
        { id: "all", label: "All Rules", filter: () => true },
      ]}
      detailFields={[
        { label: "Incoming Query Phrase", render: (s) => `"${s.queryTerm}"` },
        { label: "Equated Keyword Synonyms", render: (s) => s.synonyms.join(", ") },
        { label: "Manually Pinned Premiere Asset", render: (s) => s.pinnedAssetTitle ? `${s.pinnedAssetTitle} (${s.pinnedAssetId})` : "Standard catalog ordering" },
        { label: "Search Weight Boost", render: (s) => `${s.boostMultiplier}x baseline ranking` },
      ]}
    />
  );
}
