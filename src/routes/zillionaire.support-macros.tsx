import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MessageSquareText, Plus, Edit2, Copy, Check, Tag } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/support-macros")({
  component: SupportMacrosRoute,
  head: () => ({
    meta: [{ title: "Support Macros | Zillionaire Control Centre" }],
  }),
});

interface SupportMacro {
  id: string;
  shortcut: string;
  title: string;
  category: "billing" | "playback" | "copyright" | "kyc" | "general";
  template: string;
  usageCount: number;
  lastUsedAt: string;
}

const mockMacros: SupportMacro[] = [
  {
    id: "macro_pay_01",
    shortcut: "#payout-delay",
    title: "Standard Monthly Payout Timeline",
    category: "billing",
    template: "Hello {{name}},\n\nPayouts for the previous calendar month are processed between the 30th and the 1st. Depending on your bank clearing network, disbursements may take 1-3 business days to reflect in your account.\n\nBest regards,\nBQ SQWAD Finance Team",
    usageCount: 42,
    lastUsedAt: "2026-03-23T11:00:00Z",
  },
  {
    id: "macro_dmca_01",
    shortcut: "#dmca-counter",
    title: "DMCA Counter-Notice Procedure",
    category: "copyright",
    template: "Hello {{name}},\n\nA counter-notice has been received for title {{asset_title}}. Under our copyright policy, the claimant has 14 calendar days to file legal action. If no filing is submitted, your video will be automatically restored.\n\nBQ SQWAD Legal Operations",
    usageCount: 18,
    lastUsedAt: "2026-03-21T15:20:00Z",
  },
  {
    id: "macro_kyc_01",
    shortcut: "#kyc-docs",
    title: "Provider KYC Documents Required",
    category: "kyc",
    template: "Hello {{name}},\n\nTo complete Tier 2 broadcaster verification, please provide your Certificate of Incorporation and Tax Identification Number (TIN) via your Provider Console settings.\n\nBQ SQWAD Compliance",
    usageCount: 29,
    lastUsedAt: "2026-03-24T09:45:00Z",
  },
];

function SupportMacrosRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="support">
      {(account) => <SupportMacrosContent account={account} />}
    </ConsolePageGuard>
  );
}

function SupportMacrosContent({ account }: { account: ConsoleAccount }) {
  const [macros, setMacros] = useState<SupportMacro[]>(mockMacros);

  const columns: EntityColumn<SupportMacro>[] = [
    { key: "shortcut", header: "Shortcut", render: (m) => <span className="font-mono font-bold text-cyan-400">{m.shortcut}</span> },
    { key: "title", header: "Macro Title", render: (m) => <span className="font-semibold text-white">{m.title}</span> },
    { key: "category", header: "Category", render: (m) => <span className="capitalize text-slate-300">{m.category}</span> },
    { key: "usage", header: "Times Used", render: (m) => <span className="font-mono text-slate-200">{m.usageCount}</span> },
    { key: "lastUsed", header: "Last Used", render: (m) => <span className="text-slate-400">{new Date(m.lastUsedAt).toLocaleDateString()}</span> },
  ];

  const actions: EntityAction<SupportMacro>[] = [
    {
      label: "Copy Macro Template",
      variant: "primary",
      icon: Copy,
      onClick: (item) => {
        navigator.clipboard.writeText(item.template);
      },
    },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Support Macros & Canned Responses"
      subtitle="Standardized customer and partner response templates for rapid, legally consistent ticket handling."
      icon={MessageSquareText}
      items={macros}
      columns={columns}
      idKey="id"
      searchFields={["shortcut", "title", "template", "category"]}
      kpis={[
        { title: "Total Macros", value: macros.length, tone: "cyan" },
        { title: "Billing Macros", value: macros.filter((m) => m.category === "billing").length, tone: "emerald" },
        { title: "Copyright Macros", value: macros.filter((m) => m.category === "copyright").length, tone: "amber" },
        { title: "Total Times Used", value: macros.reduce((s, m) => s + m.usageCount, 0), tone: "primary" },
      ]}
      tabs={[
        { id: "all", label: "All Macros", filter: () => true },
        { id: "billing", label: "Billing", filter: (m) => m.category === "billing" },
        { id: "copyright", label: "Copyright", filter: (m) => m.category === "copyright" },
        { id: "kyc", label: "KYC Review", filter: (m) => m.category === "kyc" },
      ]}
      actions={actions}
      detailFields={[
        { label: "Shortcut", render: (m) => m.shortcut },
        { label: "Title", render: (m) => m.title },
        { label: "Category", render: (m) => m.category },
        { label: "Full Template Text", render: (m) => <pre className="whitespace-pre-wrap font-sans text-xs bg-slate-950 p-3 rounded-xl border border-white/10">{m.template}</pre> },
      ]}
    />
  );
}
