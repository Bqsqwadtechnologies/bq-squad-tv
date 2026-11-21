import { useState, useMemo, type ReactNode } from "react";
import {
  Search,
  Filter,
  Plus,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Shield,
  Download,
  Trash2,
  Edit3,
} from "lucide-react";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import type { ConsoleAccount } from "@/components/ConsolePageGuard";

export interface EntityColumn<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  sortable?: boolean;
}

export interface EntityAction<T> {
  label: string;
  variant?: "primary" | "destructive" | "outline" | "success";
  icon?: any;
  onClick: (item: T, notes?: string) => Promise<void> | void;
  requiresNotes?: boolean;
}

export interface ZillionaireEntityConsoleProps<T> {
  account: ConsoleAccount;
  title: string;
  subtitle: string;
  icon: any;
  items: T[];
  columns: EntityColumn<T>[];
  idKey: keyof T;
  searchFields?: (keyof T)[];
  kpis?: Array<{
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: any;
    tone?: "primary" | "emerald" | "amber" | "rose" | "cyan";
  }>;
  tabs?: Array<{ id: string; label: string; filter: (item: T) => boolean }>;
  actions?: EntityAction<T>[];
  detailFields?: Array<{
    label: string;
    render: (item: T) => ReactNode;
  }>;
  onRefresh?: () => Promise<void> | void;
  onAdd?: () => void;
  addLabel?: string;
  loading?: boolean;
}

export function ZillionaireEntityConsole<T extends Record<string, any>>({
  account,
  title,
  subtitle,
  icon: ModuleIcon,
  items,
  columns,
  idKey,
  searchFields = [],
  kpis = [],
  tabs = [],
  actions = [],
  detailFields = [],
  onRefresh,
  onAdd,
  addLabel,
  loading = false,
}: ZillionaireEntityConsoleProps<T>) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [busyAction, setBusyAction] = useState(false);

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (activeTab !== "all") {
      const tabDef = tabs.find((t) => t.id === activeTab);
      if (tabDef) result = result.filter(tabDef.filter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((item) =>
        searchFields.some((field) => {
          const val = item[field];
          return val ? String(val).toLowerCase().includes(query) : false;
        }),
      );
    }

    return result;
  }, [items, activeTab, tabs, searchQuery, searchFields]);

  async function handleActionClick(act: EntityAction<T>) {
    if (!selectedItem) return;
    setBusyAction(true);
    try {
      await act.onClick(selectedItem, actionNotes);
      setSelectedItem(null);
      setActionNotes("");
    } finally {
      setBusyAction(false);
    }
  }

  return (
    <ConsoleShell activePath={typeof window !== "undefined" ? window.location.pathname : ""} account={account}>
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title={title}
          subtitle={subtitle}
          badge="Zillionaire Management"
          badgeIcon={ModuleIcon}
          rightContent={
            <div className="flex items-center gap-2">
              {onRefresh && (
                <button
                  type="button"
                  onClick={() => void onRefresh()}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition"
                >
                  <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                  <span>Refresh</span>
                </button>
              )}
              {onAdd && (
                <button
                  type="button"
                  onClick={onAdd}
                  className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300 transition"
                >
                  <Plus size={14} />
                  <span>{addLabel || "Create New"}</span>
                </button>
              )}
            </div>
          }
        />

        {/* KPIs */}
        {kpis.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpis.map((kpi, idx) => (
              <ConsoleKpiCard
                key={idx}
                title={kpi.title}
                value={String(kpi.value)}
                subtitle={kpi.subtitle}
                icon={kpi.icon || ModuleIcon}
                tone={kpi.tone || "cyan"}
              />
            ))}
          </div>
        )}

        {/* Controls Bar: Tabs, Search */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  activeTab === tab.id
                    ? "bg-cyan-400 text-slate-950 shadow-sm"
                    : "border border-white/5 bg-white/5 text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search records…"
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Data Table */}
        <ConsoleCard title={`${filteredItems.length} Records`} icon={ModuleIcon}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {columns.map((col) => (
                    <th key={col.key} className="px-4 py-3">
                      {col.header}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-400">
                      No records match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr
                      key={String(item[idKey])}
                      onClick={() => setSelectedItem(item)}
                      className="cursor-pointer transition hover:bg-white/5"
                    >
                      {columns.map((col) => (
                        <td key={col.key} className="px-4 py-3">
                          {col.render(item)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItem(item);
                          }}
                          className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-semibold"
                        >
                          <span>Manage</span>
                          <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ConsoleCard>

        {/* Detail Modal */}
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="max-w-2xl w-full rounded-3xl border border-white/10 bg-[#07143D] p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ModuleIcon size={18} className="text-cyan-400" />
                  <span>Record Details: {String(selectedItem[idKey])}</span>
                </h3>
                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setActionNotes("");
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {detailFields.map((field, idx) => (
                  <div key={idx} className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      {field.label}
                    </span>
                    <div className="text-xs text-white break-words">{field.render(selectedItem)}</div>
                  </div>
                ))}
              </div>

              {/* Action Notes Input if actions exist */}
              {actions.length > 0 && (
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Operator Decision Notes / Audit Reason
                  </label>
                  <textarea
                    rows={3}
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Provide mandatory notes or instructions for this action…"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    setActionNotes("");
                  }}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5"
                >
                  Close
                </button>
                {actions.map((act, idx) => {
                  const Icon = act.icon;
                  const isDestructive = act.variant === "destructive";
                  const isSuccess = act.variant === "success";
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={busyAction || (act.requiresNotes && !actionNotes.trim())}
                      onClick={() => void handleActionClick(act)}
                      className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${
                        isDestructive
                          ? "bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:bg-rose-500/30"
                          : isSuccess
                            ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30"
                            : "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                      }`}
                    >
                      {Icon && <Icon size={14} />}
                      <span>{act.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
