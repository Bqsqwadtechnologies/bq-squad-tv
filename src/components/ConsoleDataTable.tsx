import { useState, useMemo, type ReactNode } from "react";
import { Search, ChevronRight, X, AlertCircle, RefreshCw, Layers } from "lucide-react";
import { ConsoleStatusBadge, ConsoleCard } from "@/components/ConsoleShell";

export type ColumnDef<T> = {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  sortable?: boolean;
  className?: string;
};

export type FilterOption = {
  id: string;
  label: string;
  count?: number;
};

export type ConsoleDataTableProps<T> = {
  title: string;
  subtitle?: string;
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (item: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (item: T, query: string) => boolean;
  filters?: FilterOption[];
  activeFilter?: string;
  onFilterChange?: (filterId: string) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRefresh?: () => void;
  actions?: ReactNode;
  renderDrawer?: (item: T, onClose: () => void) => ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function ConsoleDataTable<T>({
  title,
  subtitle,
  data,
  columns,
  keyExtractor,
  searchPlaceholder = "Search records…",
  searchFilter,
  filters,
  activeFilter,
  onFilterChange,
  isLoading = false,
  errorMessage = null,
  onRefresh,
  actions,
  renderDrawer,
  emptyTitle = "No records found",
  emptyDescription = "There are no items matching the active filter or search query.",
}: ConsoleDataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim() || !searchFilter) return data;
    const q = searchQuery.toLowerCase().trim();
    return data.filter((item) => searchFilter(item, q));
  }, [data, searchQuery, searchFilter]);

  return (
    <div className="space-y-4">
      <ConsoleCard
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            )}
            {actions}
          </div>
        }
      >
        {/* Search and Filters Bar */}
        {(searchFilter || filters) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 mb-4">
            {filters && filters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onFilterChange?.(f.id)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      activeFilter === f.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <span>{f.label}</span>
                    {typeof f.count === "number" && (
                      <span className="rounded-full bg-black/10 px-1.5 py-0.2 text-[10px]">
                        {f.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {searchFilter && (
              <div className="relative min-w-[220px]">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}
          </div>
        )}

        {/* Error State */}
        {errorMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs font-medium text-destructive mb-4">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-2 py-8 text-center text-xs text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary" />
            <div>Loading records…</div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredData.length === 0 && (
          <div className="py-12 text-center">
            <Layers className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <h4 className="text-xs font-bold text-foreground">{emptyTitle}</h4>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-sm mx-auto">
              {emptyDescription}
            </p>
          </div>
        )}

        {/* Table Render */}
        {!isLoading && filteredData.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  {columns.map((col) => (
                    <th key={col.key} className={`pb-2.5 font-semibold ${col.className || ""}`}>
                      {col.header}
                    </th>
                  ))}
                  {renderDrawer && <th className="pb-2.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredData.map((item) => {
                  const key = keyExtractor(item);
                  return (
                    <tr
                      key={key}
                      onClick={() => renderDrawer && setSelectedItem(item)}
                      className={`group transition hover:bg-muted/40 ${
                        renderDrawer ? "cursor-pointer" : ""
                      }`}
                    >
                      {columns.map((col) => (
                        <td key={col.key} className={`py-3 ${col.className || ""}`}>
                          {col.render ? col.render(item) : (item as any)[col.key]}
                        </td>
                      ))}
                      {renderDrawer && (
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            className="rounded-lg p-1 text-muted-foreground group-hover:text-primary transition"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ConsoleCard>

      {/* Slide-over Detail Drawer */}
      {selectedItem && renderDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="h-full w-full max-w-md border-l border-border bg-card p-6 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
              <h3 className="font-bold text-sm text-foreground">Record Details</h3>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderDrawer(selectedItem, () => setSelectedItem(null))}
          </div>
        </div>
      )}
    </div>
  );
}
