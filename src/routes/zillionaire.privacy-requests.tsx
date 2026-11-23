import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileArchive, Trash2, Download, CheckCircle2, ShieldCheck } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/privacy-requests")({
  component: PrivacyRequestsRoute,
  head: () => ({
    meta: [{ title: "Privacy & Data Requests | Zillionaire Control Centre" }],
  }),
});

interface PrivacyRequest {
  id: string;
  userEmail: string;
  userRole: "viewer" | "producer" | "provider";
  requestType: "export_archive" | "account_deletion";
  status: "pending" | "processing" | "completed" | "rejected";
  requestedAt: string;
  legalRegulation: "GDPR" | "NDPR" | "CCPA";
}


function PrivacyRequestsRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="security">
      {({ account }) => <PrivacyRequestsContent account={account} />}
    </ConsolePageGuard>
  );
}

function PrivacyRequestsContent({ account }: { account: ConsoleAccount }) {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);

  const columns: EntityColumn<PrivacyRequest>[] = [
    { key: "email", header: "User Email", render: (r) => <span className="font-semibold text-white">{r.userEmail}</span> },
    { key: "role", header: "Account Role", render: (r) => <span className="capitalize text-slate-300">{r.userRole}</span> },
    {
      key: "type",
      header: "Action Requested",
      render: (r) => (
        <span className={`font-mono text-xs font-bold ${r.requestType === "account_deletion" ? "text-rose-400" : "text-cyan-400"}`}>
          {r.requestType === "account_deletion" ? "Delete Account & Purge Data" : "Export Data Archive"}
        </span>
      ),
    },
    { key: "law", header: "Framework", render: (r) => <span className="font-mono text-slate-300 font-bold">{r.legalRegulation}</span> },
    { key: "status", header: "Status", render: (r) => <ConsoleStatusBadge status={r.status === "completed" ? "active" : r.status === "pending" ? "pending" : "inactive"} label={r.status} /> },
  ];

  const actions: EntityAction<PrivacyRequest>[] = [
    {
      label: "Process & Deliver",
      variant: "success",
      icon: CheckCircle2,
      onClick: (item) => {
        setRequests((prev) => prev.map((r) => r.id === item.id ? { ...r, status: "completed" } : r));
      },
    },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Privacy, Data Export & Deletion Centre"
      subtitle="Fulfill GDPR, NDPR, and CCPA data portability archives and permanent account deletion requests. No live records are available from a connected service yet; sample data is intentionally not shown."
      icon={FileArchive}
      items={requests}
      columns={columns}
      idKey="id"
      searchFields={["userEmail", "legalRegulation", "requestType"]}
      kpis={[
        { title: "Total Requests", value: requests.length, tone: "cyan" },
        { title: "Pending Actions", value: requests.filter((r) => r.status === "pending").length, tone: "amber" },
      ]}
      tabs={[
        { id: "all", label: "All Requests", filter: () => true },
        { id: "exports", label: "Data Exports", filter: (r) => r.requestType === "export_archive" },
        { id: "deletions", label: "Account Deletions", filter: (r) => r.requestType === "account_deletion" },
      ]}
      actions={actions}
      detailFields={[
        { label: "User Email", render: (r) => r.userEmail },
        { label: "Request Type", render: (r) => r.requestType },
        { label: "Applicable Legal Framework", render: (r) => r.legalRegulation },
        { label: "Receipt Timestamp", render: (r) => new Date(r.requestedAt).toLocaleString() },
      ]}
    />
  );
}
