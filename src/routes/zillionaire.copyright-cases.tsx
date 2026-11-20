import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Scale, CheckCircle2, XCircle, AlertTriangle, ShieldAlert } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/copyright-cases")({
  component: CopyrightCasesRoute,
  head: () => ({
    meta: [{ title: "Copyright Cases | Zillionaire Control Centre" }],
  }),
});

interface CopyrightCase {
  id: string;
  targetId: string;
  targetType: string;
  reporterName: string;
  reporterEmail: string;
  workClaimed: string;
  status: "pending_review" | "counter_notice_open" | "content_removed" | "counter_notice_restored" | "dismissed";
  counterNoticeReceived: boolean;
  strikeIssued: boolean;
  createdAt: string;
}

const mockCases: CopyrightCase[] = [
  {
    id: "case_dmca_901",
    targetId: "mov_lagos_nights",
    targetType: "content_asset",
    reporterName: "Silverbird Legal Dept",
    reporterEmail: "legal@silverbirdgroup.com",
    workClaimed: "The Lagos Nights Master Soundtrack",
    status: "counter_notice_open",
    counterNoticeReceived: true,
    strikeIssued: false,
    createdAt: "2026-03-22T10:15:00Z",
  },
  {
    id: "case_dmca_902",
    targetId: "mov_nollywood_action",
    targetType: "content_asset",
    reporterName: "FilmOne Distribution",
    reporterEmail: "anti-piracy@filmoneng.com",
    workClaimed: "Exclusive Theatrical Cut Trailer",
    status: "pending_review",
    counterNoticeReceived: false,
    strikeIssued: false,
    createdAt: "2026-03-24T14:30:00Z",
  },
  {
    id: "case_dmca_903",
    targetId: "chan_afrobeats_tv",
    targetType: "channel",
    reporterName: "Sony Music West Africa",
    reporterEmail: "dmca@sonymusic.com",
    workClaimed: "Unlicensed Broadcast of Live Concert",
    status: "content_removed",
    counterNoticeReceived: false,
    strikeIssued: true,
    createdAt: "2026-03-18T09:00:00Z",
  },
];

function CopyrightCasesRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="moderation">
      {(account) => <CopyrightCasesContent account={account} />}
    </ConsolePageGuard>
  );
}

function CopyrightCasesContent({ account }: { account: ConsoleAccount }) {
  const [cases, setCases] = useState<CopyrightCase[]>(mockCases);
  const [loading, setLoading] = useState(false);

  async function fetchCases() {
    setLoading(true);
    try {
      const res = await fetch("/api/public/v1/zillionaire/copyright-cases/");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setCases(data);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchCases();
  }, []);

  async function handleDecision(item: CopyrightCase, action: "remove" | "keep" | "restore", notes?: string) {
    try {
      await fetch("/api/public/v1/zillionaire/copyright-cases/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caseId: item.id,
          action,
          decisionNotes: notes || `Action ${action} executed by operator ${account.email}`,
        }),
      });
      await fetchCases();
    } catch {
      // ignore
    }
  }

  const columns: EntityColumn<CopyrightCase>[] = [
    { key: "id", header: "Case ID", render: (c) => <span className="font-mono font-bold text-cyan-400">{c.id}</span> },
    { key: "targetId", header: "Target Asset", render: (c) => <span className="font-semibold text-white">{c.targetId}</span> },
    { key: "reporter", header: "Claimant", render: (c) => <span className="text-slate-300">{c.reporterName}</span> },
    { key: "work", header: "Work Claimed", render: (c) => <span className="truncate max-w-[200px] text-slate-400">{c.workClaimed}</span> },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        <ConsoleStatusBadge
          status={c.status === "content_removed" ? "inactive" : c.status === "pending_review" ? "pending" : "active"}
          label={c.status.replace(/_/g, " ")}
        />
      ),
    },
    { key: "date", header: "Filed", render: (c) => <span className="text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</span> },
  ];

  const actions: EntityAction<CopyrightCase>[] = [
    {
      label: "Uphold & Remove Video (Strike)",
      variant: "destructive",
      icon: ShieldAlert,
      requiresNotes: true,
      onClick: (item, notes) => handleDecision(item, "remove", notes),
    },
    {
      label: "Counter-Notice Restore",
      variant: "success",
      icon: CheckCircle2,
      requiresNotes: true,
      onClick: (item, notes) => handleDecision(item, "restore", notes),
    },
    {
      label: "Dismiss Claim (Keep Video)",
      variant: "outline",
      icon: XCircle,
      requiresNotes: true,
      onClick: (item, notes) => handleDecision(item, "keep", notes),
    },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Copyright & DMCA Cases"
      subtitle="Review copyright infringement notices, evaluate counter-notices, and enforce takedowns with immutable records."
      icon={Scale}
      items={cases}
      columns={columns}
      idKey="id"
      searchFields={["id", "targetId", "reporterName", "reporterEmail", "workClaimed"]}
      kpis={[
        { title: "Total Cases", value: cases.length, tone: "cyan" },
        { title: "Pending Review", value: cases.filter((c) => c.status === "pending_review").length, tone: "amber" },
        { title: "Counter-Notices Open", value: cases.filter((c) => c.status === "counter_notice_open").length, tone: "emerald" },
        { title: "Content Removed", value: cases.filter((c) => c.status === "content_removed").length, tone: "rose" },
      ]}
      tabs={[
        { id: "all", label: "All Cases", filter: () => true },
        { id: "pending", label: "Pending", filter: (c) => c.status === "pending_review" },
        { id: "counter", label: "Counter-Notices", filter: (c) => c.status === "counter_notice_open" },
        { id: "removed", label: "Removed", filter: (c) => c.status === "content_removed" },
      ]}
      actions={actions}
      detailFields={[
        { label: "Case ID", render: (c) => c.id },
        { label: "Target ID", render: (c) => `${c.targetType} : ${c.targetId}` },
        { label: "Claimant Name & Email", render: (c) => `${c.reporterName} (${c.reporterEmail})` },
        { label: "Work Claimed", render: (c) => c.workClaimed },
        { label: "Counter-Notice Status", render: (c) => (c.counterNoticeReceived ? "Counter-notice received; 14-day window open" : "None") },
        { label: "Strike Impact", render: (c) => (c.strikeIssued ? "1 Copyright Strike Assigned" : "No Strike") },
      ]}
      onRefresh={fetchCases}
      loading={loading}
    />
  );
}
