import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, AlertTriangle, Fingerprint, Lock, ShieldX } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/fraud-watch")({
  component: FraudWatchRoute,
  head: () => ({
    meta: [{ title: "Fraud & Abuse Watch | Zillionaire Control Centre" }],
  }),
});

interface FraudIncident {
  id: string;
  targetUid: string;
  targetEmail: string;
  patternType: "multi_account_farming" | "rapid_chargeback" | "vpn_anonymizer" | "bot_view_inflation";
  riskScore: number;
  evidence: string;
  status: "flagged" | "investigating" | "account_frozen" | "cleared";
  detectedAt: string;
}


function FraudWatchRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="security">
      {({ account }) => <FraudWatchContent account={account} />}
    </ConsolePageGuard>
  );
}

function FraudWatchContent({ account }: { account: ConsoleAccount }) {
  const [incidents, setIncidents] = useState<FraudIncident[]>([]);

  const columns: EntityColumn<FraudIncident>[] = [
    { key: "target", header: "Target Account", render: (f) => <span className="font-semibold text-white">{f.targetEmail}</span> },
    { key: "pattern", header: "Abuse Pattern", render: (f) => <span className="capitalize text-amber-300">{f.patternType.replace(/_/g, " ")}</span> },
    {
      key: "risk",
      header: "Risk Score",
      render: (f) => (
        <span className={`font-mono font-bold px-2 py-0.5 rounded ${f.riskScore >= 80 ? "bg-rose-500/20 text-rose-300" : "bg-amber-500/20 text-amber-300"}`}>
          {f.riskScore} / 100
        </span>
      ),
    },
    { key: "status", header: "Action Status", render: (f) => <ConsoleStatusBadge status={f.status === "account_frozen" ? "inactive" : f.status === "cleared" ? "active" : "pending"} label={f.status.replace(/_/g, " ")} /> },
    { key: "detected", header: "Detected", render: (f) => <span className="text-slate-400">{new Date(f.detectedAt).toLocaleDateString()}</span> },
  ];

  const actions: EntityAction<FraudIncident>[] = [
    {
      label: "Freeze Account & Wallets",
      variant: "destructive",
      icon: Lock,
      requiresNotes: true,
      onClick: (item) => {
        setIncidents((prev) => prev.map((f) => f.id === item.id ? { ...f, status: "account_frozen" } : f));
      },
    },
    {
      label: "Clear Suspicion",
      variant: "success",
      icon: ShieldAlert,
      onClick: (item) => {
        setIncidents((prev) => prev.map((f) => f.id === item.id ? { ...f, status: "cleared" } : f));
      },
    },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Fraud, Multi-Account & Abuse Watch"
      subtitle="Detect automated watch inflation, multi-account bonus farming, VPN anonymizers, and chargeback anomalies. No live records are available from a connected service yet; sample data is intentionally not shown."
      icon={Fingerprint}
      items={incidents}
      columns={columns}
      idKey="id"
      searchFields={["targetEmail", "targetUid", "patternType", "evidence"]}
      kpis={[
        { title: "Detected Incidents", value: incidents.length, tone: "cyan" },
        { title: "High Risk (>80)", value: incidents.filter((f) => f.riskScore >= 80).length, tone: "rose" },
        { title: "Frozen Accounts", value: incidents.filter((f) => f.status === "account_frozen").length, tone: "amber" },
      ]}
      tabs={[
        { id: "all", label: "All Incidents", filter: () => true },
        { id: "high_risk", label: "High Risk Only", filter: (f) => f.riskScore >= 80 },
        { id: "frozen", label: "Frozen Accounts", filter: (f) => f.status === "account_frozen" },
      ]}
      actions={actions}
      detailFields={[
        { label: "Account Identity", render: (f) => `${f.targetEmail} (${f.targetUid})` },
        { label: "Abuse Fingerprint & Pattern", render: (f) => f.patternType.replace(/_/g, " ").toUpperCase() },
        { label: "Algorithmic Risk Score", render: (f) => `${f.riskScore} / 100` },
        { label: "Diagnostic Forensic Evidence", render: (f) => f.evidence },
      ]}
    />
  );
}
