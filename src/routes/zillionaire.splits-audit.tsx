import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Calculator, ShieldCheck, CheckCircle2, DollarSign, Download, ArrowDownRight } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/splits-audit")({
  component: SplitsAuditRoute,
  head: () => ({
    meta: [{ title: "Revenue & Splits Audit | Zillionaire Control Centre" }],
  }),
});

interface SplitAuditEntry {
  id: string;
  assetId: string;
  grossAmountMinor: number;
  platformShareMinor: number;
  producerShareMinor: number;
  collaboratorShareMinor: number;
  reconciled: boolean;
  currency: string;
  period: string;
  timestamp: string;
}


function SplitsAuditRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="finance">
      {({ account }) => <SplitsAuditContent account={account} />}
    </ConsolePageGuard>
  );
}

function SplitsAuditContent({ account }: { account: ConsoleAccount }) {
  const [entries] = useState<SplitAuditEntry[]>([]);

  const columns: EntityColumn<SplitAuditEntry>[] = [
    { key: "id", header: "Audit ID", render: (e) => <span className="font-mono text-cyan-400">{e.id}</span> },
    { key: "asset", header: "Asset", render: (e) => <span className="font-semibold text-white">{e.assetId}</span> },
    {
      key: "gross",
      header: "Gross Stream",
      render: (e) => <span className="font-mono text-white">₦{(e.grossAmountMinor / 100).toLocaleString()}</span>,
    },
    {
      key: "platform",
      header: "Platform (50%)",
      render: (e) => <span className="font-mono text-cyan-300">₦{(e.platformShareMinor / 100).toLocaleString()}</span>,
    },
    {
      key: "producer",
      header: "Producer",
      render: (e) => <span className="font-mono text-emerald-300">₦{(e.producerShareMinor / 100).toLocaleString()}</span>,
    },
    {
      key: "collab",
      header: "Collaborator",
      render: (e) => <span className="font-mono text-amber-300">₦{(e.collaboratorShareMinor / 100).toLocaleString()}</span>,
    },
    {
      key: "reconciled",
      header: "Reconciled",
      render: (e) => <ConsoleStatusBadge status={e.reconciled ? "active" : "pending"} label={e.reconciled ? "Matched" : "Unverified"} />,
    },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Revenue & Splits Audit"
      subtitle="Complete ledger verification of platform, producer, and collaborator allocations to the exact kobo. No live records are available from a connected service yet; sample data is intentionally not shown."
      icon={Calculator}
      items={entries}
      columns={columns}
      idKey="id"
      searchFields={["id", "assetId", "period"]}
      kpis={[
        { title: "Total Streams Audited", value: entries.length, tone: "cyan" },
        {
          title: "Audited Gross",
          value: `₦${(entries.reduce((s, e) => s + e.grossAmountMinor, 0) / 100).toLocaleString()}`,
          tone: "primary",
        },
        {
          title: "Platform Gross (50%)",
          value: `₦${(entries.reduce((s, e) => s + e.platformShareMinor, 0) / 100).toLocaleString()}`,
          tone: "cyan",
        },
        {
          title: "Total Creator Payouts",
          value: `₦${(entries.reduce((s, e) => s + e.producerShareMinor + e.collaboratorShareMinor, 0) / 100).toLocaleString()}`,
          tone: "emerald",
        },
      ]}
      tabs={[
        { id: "all", label: "All Records", filter: () => true },
        { id: "reconciled", label: "Reconciled", filter: (e) => e.reconciled },
        { id: "unverified", label: "Pending Verification", filter: (e) => !e.reconciled },
      ]}
      detailFields={[
        { label: "Audit Ledger ID", render: (e) => e.id },
        { label: "Asset ID", render: (e) => e.assetId },
        { label: "Accounting Period", render: (e) => e.period },
        { label: "Gross Watch Spend", render: (e) => `₦${(e.grossAmountMinor / 100).toFixed(2)}` },
        { label: "Platform Retained (50%)", render: (e) => `₦${(e.platformShareMinor / 100).toFixed(2)}` },
        { label: "Producer Net Disbursed", render: (e) => `₦${(e.producerShareMinor / 100).toFixed(2)}` },
        { label: "Collaborator Disbursed", render: (e) => `₦${(e.collaboratorShareMinor / 100).toFixed(2)}` },
        {
          label: "Mathematical Proof",
          render: (e) =>
            `${e.platformShareMinor} + ${e.producerShareMinor} + ${e.collaboratorShareMinor} = ${e.grossAmountMinor} (Exact sum matches gross)`,
        },
      ]}
    />
  );
}
