import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, AlertTriangle, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/strikes-appeals")({
  component: StrikesAppealsRoute,
  head: () => ({
    meta: [{ title: "Strikes & Appeals Centre | Zillionaire Control Centre" }],
  }),
});

interface StrikeRecord {
  id: string;
  accountUid: string;
  accountRole: "producer" | "provider" | "viewer";
  accountEmail: string;
  strikeCount: number;
  strikeType: "copyright" | "community_guidelines" | "kyc_fraud";
  reason: string;
  penaltiesActive: string;
  appealStatus: "none" | "submitted" | "approved" | "rejected";
  issuedAt: string;
  expiresAt: string;
}

const mockStrikes: StrikeRecord[] = [
  {
    id: "str_001",
    accountUid: "prod_pirate_copy",
    accountRole: "producer",
    accountEmail: "badproducer@example.com",
    strikeCount: 2,
    strikeType: "copyright",
    reason: "Repeated upload of copyrighted cinematic film after formal takedown notice.",
    penaltiesActive: "14-day upload suspension, monetisation freeze",
    appealStatus: "submitted",
    issuedAt: "2026-03-20",
    expiresAt: "2026-06-20",
  },
  {
    id: "str_002",
    accountUid: "prod_honest_studio",
    accountRole: "producer",
    accountEmail: "studio@honestfilm.ng",
    strikeCount: 1,
    strikeType: "copyright",
    reason: "Audio background track matched Sony Music catalogue.",
    penaltiesActive: "Warning notice issued",
    appealStatus: "none",
    issuedAt: "2026-03-15",
    expiresAt: "2026-06-15",
  },
];

function StrikesAppealsRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="security">
      {(account) => <StrikesAppealsContent account={account} />}
    </ConsolePageGuard>
  );
}

function StrikesAppealsContent({ account }: { account: ConsoleAccount }) {
  const [items, setItems] = useState<StrikeRecord[]>(mockStrikes);

  const columns: EntityColumn<StrikeRecord>[] = [
    { key: "email", header: "Account", render: (s) => <span className="font-semibold text-white">{s.accountEmail}</span> },
    { key: "role", header: "Role", render: (s) => <span className="capitalize text-slate-300">{s.accountRole}</span> },
    {
      key: "strikes",
      header: "Strike Count",
      render: (s) => (
        <span className={`font-mono font-bold px-2 py-0.5 rounded ${s.strikeCount >= 3 ? "bg-rose-500/20 text-rose-300" : s.strikeCount === 2 ? "bg-amber-500/20 text-amber-300" : "bg-cyan-500/20 text-cyan-300"}`}>
          Strike {s.strikeCount} / 3
        </span>
      ),
    },
    { key: "type", header: "Violation Type", render: (s) => <span className="capitalize text-slate-300">{s.strikeType.replace(/_/g, " ")}</span> },
    { key: "appeal", header: "Appeal Status", render: (s) => <ConsoleStatusBadge status={s.appealStatus === "submitted" ? "pending" : s.appealStatus === "approved" ? "active" : "inactive"} label={s.appealStatus === "none" ? "No Appeal" : `Appeal: ${s.appealStatus}`} /> },
  ];

  const actions: EntityAction<StrikeRecord>[] = [
    {
      label: "Grant Appeal & Lift Strike",
      variant: "success",
      icon: CheckCircle2,
      requiresNotes: true,
      onClick: (item) => {
        setItems((prev) => prev.map((s) => s.id === item.id ? { ...s, appealStatus: "approved", strikeCount: Math.max(0, s.strikeCount - 1) } : s));
      },
    },
    {
      label: "Reject Appeal",
      variant: "destructive",
      icon: XCircle,
      requiresNotes: true,
      onClick: (item) => {
        setItems((prev) => prev.map((s) => s.id === item.id ? { ...s, appealStatus: "rejected" } : s));
      },
    },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Strike & Appeal Operations Centre"
      subtitle="Manage copyright and community guideline strikes across producers and broadcasters with formal appeal reviews."
      icon={ShieldAlert}
      items={items}
      columns={columns}
      idKey="id"
      searchFields={["accountEmail", "accountUid", "reason"]}
      kpis={[
        { title: "Total Active Strikes", value: items.length, tone: "rose" },
        { title: "Pending Appeals", value: items.filter((s) => s.appealStatus === "submitted").length, tone: "amber" },
        { title: "Termination Level (3 Strikes)", value: items.filter((s) => s.strikeCount >= 3).length, tone: "rose" },
      ]}
      tabs={[
        { id: "all", label: "All Strikes", filter: () => true },
        { id: "appeals", label: "Appeals Pending", filter: (s) => s.appealStatus === "submitted" },
      ]}
      actions={actions}
      detailFields={[
        { label: "Account Email & UID", render: (s) => `${s.accountEmail} (${s.accountUid})` },
        { label: "Violation Rationale", render: (s) => s.reason },
        { label: "Active Penalties", render: (s) => s.penaltiesActive },
        { label: "Expiry Date", render: (s) => `Expires on ${s.expiresAt} if no further violations occur` },
      ]}
    />
  );
}
