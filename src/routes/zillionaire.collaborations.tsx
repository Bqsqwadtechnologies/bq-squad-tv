import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Users2, CheckCircle, XCircle, Clock, ShieldCheck, DollarSign } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/collaborations")({
  component: CollaborationsOversightRoute,
  head: () => ({
    meta: [{ title: "Collaborations Oversight | Zillionaire Control Centre" }],
  }),
});

interface Collaboration {
  id: string;
  assetId: string;
  assetTitle: string;
  producerUid: string;
  partnerUid: string;
  partnerEmail: string;
  partnerSharePercent: number;
  producerSharePercent: number;
  status: "active" | "pending_approval" | "rejected" | "suspended";
  accruedPartnerMinor: number;
  createdAt: string;
}

const mockCollabs: Collaboration[] = [
  {
    id: "collab_901",
    assetId: "mov_lagos_nights",
    assetTitle: "Lagos Nights: Underground",
    producerUid: "prod_filmmaker_01",
    partnerUid: "prod_sound_designer_99",
    partnerEmail: "sound@lagosaudio.com",
    partnerSharePercent: 20,
    producerSharePercent: 80,
    status: "active",
    accruedPartnerMinor: 284000,
    createdAt: "2026-03-01T08:00:00Z",
  },
  {
    id: "collab_902",
    assetId: "mov_super_eagles",
    assetTitle: "Super Eagles: African Kings",
    producerUid: "prod_sports_doc",
    partnerUid: "prod_camera_crew",
    partnerEmail: "dop@cinematv.ng",
    partnerSharePercent: 30,
    producerSharePercent: 70,
    status: "pending_approval",
    accruedPartnerMinor: 0,
    createdAt: "2026-03-20T12:00:00Z",
  },
  {
    id: "collab_903",
    assetId: "mov_nollywood_drama",
    assetTitle: "Heart of Abuja",
    producerUid: "prod_abuja_studios",
    partnerUid: "prod_vfx_house",
    partnerEmail: "contact@africavfx.com",
    partnerSharePercent: 15,
    producerSharePercent: 85,
    status: "active",
    accruedPartnerMinor: 145000,
    createdAt: "2026-02-15T10:00:00Z",
  },
];

function CollaborationsOversightRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="finance">
      {({ account }) => <CollaborationsContent account={account} />}
    </ConsolePageGuard>
  );
}

function CollaborationsContent({ account }: { account: ConsoleAccount }) {
  const [collabs, setCollabs] = useState<Collaboration[]>(mockCollabs);

  const columns: EntityColumn<Collaboration>[] = [
    { key: "id", header: "Agreement ID", render: (c) => <span className="font-mono text-cyan-400">{c.id}</span> },
    { key: "asset", header: "Title", render: (c) => <span className="font-semibold text-white">{c.assetTitle}</span> },
    { key: "partner", header: "Partner Email", render: (c) => <span className="text-slate-300">{c.partnerEmail}</span> },
    {
      key: "split",
      header: "Split Ratio",
      render: (c) => (
        <span className="font-mono text-emerald-400 font-bold">
          {c.producerSharePercent}% / {c.partnerSharePercent}%
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        <ConsoleStatusBadge
          status={c.status === "active" ? "active" : c.status === "pending_approval" ? "pending" : "inactive"}
          label={c.status.replace(/_/g, " ")}
        />
      ),
    },
    {
      key: "earnings",
      header: "Accrued Share",
      render: (c) => (
        <span className="font-mono text-slate-200">
          ₦{(c.accruedPartnerMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
    },
  ];

  const actions: EntityAction<Collaboration>[] = [
    {
      label: "Approve Agreement",
      variant: "success",
      icon: CheckCircle,
      onClick: (item) => {
        setCollabs((prev) => prev.map((c) => (c.id === item.id ? { ...c, status: "active" } : c)));
      },
    },
    {
      label: "Suspend Split",
      variant: "destructive",
      icon: XCircle,
      requiresNotes: true,
      onClick: (item) => {
        setCollabs((prev) => prev.map((c) => (c.id === item.id ? { ...c, status: "suspended" } : c)));
      },
    },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Collaborations Oversight"
      subtitle="Audit all producer collaboration contracts, inspect revenue split percentages, and manage agreement statuses."
      icon={Users2}
      items={collabs}
      columns={columns}
      idKey="id"
      searchFields={["id", "assetTitle", "partnerEmail", "producerUid"]}
      kpis={[
        { title: "Total Collaborations", value: collabs.length, tone: "cyan" },
        { title: "Active Agreements", value: collabs.filter((c) => c.status === "active").length, tone: "emerald" },
        { title: "Pending Approval", value: collabs.filter((c) => c.status === "pending_approval").length, tone: "amber" },
        {
          title: "Partner Accruals",
          value: `₦${(collabs.reduce((sum, c) => sum + c.accruedPartnerMinor, 0) / 100).toLocaleString()}`,
          tone: "primary",
        },
      ]}
      tabs={[
        { id: "all", label: "All Agreements", filter: () => true },
        { id: "active", label: "Active", filter: (c) => c.status === "active" },
        { id: "pending", label: "Pending Approval", filter: (c) => c.status === "pending_approval" },
      ]}
      actions={actions}
      detailFields={[
        { label: "Agreement ID", render: (c) => c.id },
        { label: "Content Asset", render: (c) => `${c.assetTitle} (${c.assetId})` },
        { label: "Primary Producer UID", render: (c) => c.producerUid },
        { label: "Partner UID & Email", render: (c) => `${c.partnerUid} (${c.partnerEmail})` },
        { label: "Producer Share", render: (c) => `${c.producerSharePercent}% of net creator earnings` },
        { label: "Collaborator Share", render: (c) => `${c.partnerSharePercent}% of net creator earnings` },
      ]}
    />
  );
}
