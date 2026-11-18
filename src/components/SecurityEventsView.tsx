import { useEffect, useState, useId, type FormEvent } from "react";
import {
  ShieldAlert,
  Search,
  Filter,
  Clock,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Copy,
  UserCheck,
  Lock,
  BarChart2,
  ExternalLink,
  Laptop,
  Smartphone,
  Server,
  HelpCircle,
  X,
  ChevronDown,
} from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";
import type { AccessDenialEvent } from "@/lib/server/access-denials";

export type SecurityEventsViewProps = {
  sessionToken?: string | undefined;
  isOwner?: boolean | undefined;
};

type HourlyCount = {
  hour: string;
  count: number;
};

type ResolvedAccount = {
  uid: string;
  email: string | null;
  roleTags: string[];
  createdAt: string | null;
};

const REASON_LABELS: Record<string, { label: string; description: string }> = {
  CROSS_ROLE_DENIED: {
    label: "Cross-role restricted",
    description: "Account role does not have permission for this resource.",
  },
  MISSING_MODULE: {
    label: "Permission missing",
    description: "Account lacks the delegated module permission.",
  },
  CROSS_TENANT_DENIED: {
    label: "Tenant boundary protected",
    description: "Attempted to access another provider's resources.",
  },
  FEATURE_FLAG_DISABLED: {
    label: "System control disabled",
    description: "Access blocked because the system feature is turned off.",
  },
  SUSPENDED_PRODUCER: {
    label: "Suspended account",
    description: "Producer account is currently suspended.",
  },
  INACTIVE_PLAN: {
    label: "Inactive plan",
    description: "Producer plan is inactive or expired.",
  },
  INVALID_WORKER_SIGNATURE: {
    label: "Invalid worker signature",
    description: "Cryptographic signature failed verification.",
  },
};

function formatReason(code: string): string {
  return REASON_LABELS[code]?.label || code.replace(/_/g, " ").toLowerCase();
}

function formatHourLabel(hourBucket: string): string {
  // e.g. "2026-11-18T14" -> "Nov 18, 14:00"
  try {
    const parts = hourBucket.split("T");
    if (parts.length === 2) {
      const dateParts = parts[0]!.split("-");
      const hour = parts[1];
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const monthIndex = Number.parseInt(dateParts[1]!, 10) - 1;
      const day = Number.parseInt(dateParts[2]!, 10);
      return `${monthNames[monthIndex] || dateParts[1]} ${day}, ${hour}:00`;
    }
  } catch {
    // fallback
  }
  return hourBucket;
}

function formatEventTime(isoTime: string): string {
  try {
    const d = new Date(isoTime);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return isoTime;
  }
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "android" || platform === "ios") {
    return <Smartphone size={14} className="text-cyan-300" aria-label={`Mobile ${platform}`} />;
  }
  if (platform === "worker") {
    return <Server size={14} className="text-amber-300" aria-label="Background worker" />;
  }
  if (platform === "web") {
    return <Laptop size={14} className="text-blue-300" aria-label="Web browser" />;
  }
  return <HelpCircle size={14} className="text-gray-400" aria-label="Unknown platform" />;
}

export function SecurityEventsView({ sessionToken, isOwner = false }: SecurityEventsViewProps) {
  const [events, setEvents] = useState<AccessDenialEvent[]>([]);
  const [hourlyCounts, setHourlyCounts] = useState<HourlyCount[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [timeRange, setTimeRange] = useState("24h");
  const [reasonFilter, setReasonFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [routePatternFilter, setRoutePatternFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("ALL");

  // Step-up & Lookup modal states
  const [lookupTargetHash, setLookupTargetHash] = useState<string | null>(null);
  const [lookupReason, setLookupReason] = useState("");
  const [stepUpConfirmed, setStepUpConfirmed] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<{
    found: boolean;
    account?: ResolvedAccount;
  } | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const searchInputId = useId();
  const timeSelectId = useId();
  const reasonSelectId = useId();
  const roleSelectId = useId();
  const platformSelectId = useId();
  const lookupReasonId = useId();
  const stepUpCheckId = useId();

  async function loadEvents() {
    setLoading(true);
    setError(null);
    try {
      const token = sessionToken || (await restoreWebSession());
      if (!token) {
        throw new Error("Your secure session is not available. Sign in again.");
      }

      const params = new URLSearchParams({
        timeRange,
        reason: reasonFilter,
        role: roleFilter,
        platform: platformFilter,
        limit: "100",
      });
      if (routePatternFilter.trim()) {
        params.set("routePattern", routePatternFilter.trim());
      }

      const headers = await getWebAuthHeaders(token);
      const res = await fetch(`/api/public/v1/admin/security/events?${params.toString()}`, {
        headers,
        cache: "no-store",
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
        };
        throw new Error(errJson.message || errJson.error || "Failed to load security events.");
      }

      const data = (await res.json()) as {
        events: AccessDenialEvent[];
        hourlyCounts: HourlyCount[];
        total: number;
      };

      setEvents(data.events || []);
      setHourlyCounts(data.hourlyCounts || []);
      setTotalCount(data.total || 0);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while loading security events.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, [timeRange, reasonFilter, roleFilter, platformFilter]);

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    void loadEvents();
  }

  function handleResetFilters() {
    setTimeRange("24h");
    setReasonFilter("ALL");
    setRoleFilter("ALL");
    setRoutePatternFilter("");
    setPlatformFilter("ALL");
  }

  function openLookupModal(hash: string) {
    setLookupTargetHash(hash);
    setLookupReason("");
    setStepUpConfirmed(false);
    setLookupError(null);
    setLookupResult(null);
  }

  function closeLookupModal() {
    setLookupTargetHash(null);
    setLookupReason("");
    setStepUpConfirmed(false);
    setLookupError(null);
    setLookupResult(null);
  }

  async function executeActorLookup(e: FormEvent) {
    e.preventDefault();
    if (!lookupTargetHash || !isOwner || lookupReason.trim().length < 3 || !stepUpConfirmed) {
      return;
    }

    setLookupBusy(true);
    setLookupError(null);

    try {
      const token = sessionToken || (await restoreWebSession());
      if (!token) {
        throw new Error("Your secure session is not available. Sign in again.");
      }

      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/admin/security/lookup-actor", {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          actorHash: lookupTargetHash,
          reason: lookupReason.trim(),
          stepUpConfirmed: true,
        }),
      });

      const result = (await res.json()) as {
        found: boolean;
        account?: ResolvedAccount;
        error?: string;
        message?: string;
      };

      if (!res.ok) {
        throw new Error(result.message || result.error || "Could not resolve identity.");
      }

      setLookupResult(
        result.account !== undefined
          ? { found: result.found, account: result.account }
          : { found: result.found },
      );
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setLookupBusy(false);
    }
  }

  function copyToClipboard(text: string, id: string) {
    void navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2500);
  }

  // Peak hourly calculation for bar display
  const maxHourlyCount = Math.max(1, ...hourlyCounts.map((h) => h.count));

  return (
    <section
      aria-labelledby="security-events-heading"
      className="mt-8 rounded-3xl border border-cyan-300/20 bg-[#07143d] p-5 sm:p-7 text-white"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-cyan-200">
            <ShieldAlert size={14} aria-hidden="true" />
            Security Events & Access Denials
          </div>
          <h2
            id="security-events-heading"
            className="mt-2 text-2xl font-black tracking-tight sm:text-3xl"
          >
            Access restriction ledger
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-blue-100/60">
            Privacy-safe monitoring of denied access attempts, sharded counters, and audited
            platform identity resolution.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadEvents()}
          disabled={loading}
          aria-label="Refresh security events"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#030b2a] px-4 py-2.5 text-xs font-bold text-cyan-200 transition hover:border-cyan-300/30 hover:text-white disabled:opacity-50"
        >
          <RotateCcw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Hourly Trend Overview */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-[#030b2a] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <BarChart2 size={16} className="text-cyan-300" aria-hidden="true" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-cyan-200">
              Hourly event counts ({hourlyCounts.length} recorded hours)
            </h3>
          </div>
          <div className="text-xs text-blue-100/60">
            Total in period: <strong className="text-white">{totalCount}</strong>
          </div>
        </div>

        {hourlyCounts.length === 0 ? (
          <p className="mt-4 text-xs text-blue-100/50">
            No access denial events recorded in this time window.
          </p>
        ) : (
          <div className="mt-4 grid gap-2" role="region" aria-label="Hourly distribution">
            <div className="flex items-end gap-1.5 overflow-x-auto pb-2 pt-4">
              {hourlyCounts.slice(0, 24).map((item) => {
                const heightPercent = Math.max(12, Math.round((item.count / maxHourlyCount) * 100));
                return (
                  <div
                    key={item.hour}
                    className="group relative flex flex-1 min-w-[28px] flex-col items-center justify-end"
                    style={{ height: "90px" }}
                  >
                    {/* Tooltip on hover */}
                    <div className="pointer-events-none absolute -top-8 hidden rounded bg-[#0b286f] px-2 py-1 text-[10px] font-bold text-white shadow group-hover:block whitespace-nowrap z-10">
                      {formatHourLabel(item.hour)}: {item.count} events
                    </div>
                    {/* Bar */}
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-cyan-500/40 to-cyan-300 transition-all group-hover:from-cyan-400 group-hover:to-white"
                      style={{ height: `${heightPercent}%` }}
                      role="img"
                      aria-label={`${formatHourLabel(item.hour)}: ${item.count} events`}
                    />
                    <span className="mt-1 text-[9px] text-blue-100/50 truncate w-full text-center">
                      {item.hour.slice(11)}:00
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Filter Controls */}
      <form
        onSubmit={handleSearchSubmit}
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 rounded-2xl border border-white/10 bg-[#030b2a] p-4"
        aria-label="Filter security events"
      >
        {/* Time Window */}
        <div>
          <label
            htmlFor={timeSelectId}
            className="block text-[10px] font-bold uppercase tracking-wider text-blue-100/60"
          >
            Time Window
          </label>
          <div className="relative mt-1">
            <select
              id={timeSelectId}
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full appearance-none rounded-xl border border-white/10 bg-[#07143d] px-3 py-2 text-xs text-white focus:border-cyan-300 focus:outline-none"
            >
              <option value="1h">Past 1 hour</option>
              <option value="24h">Past 24 hours</option>
              <option value="7d">Past 7 days</option>
              <option value="30d">Past 30 days</option>
              <option value="all">All recorded</option>
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-2.5 text-blue-100/40"
            />
          </div>
        </div>

        {/* Reason */}
        <div>
          <label
            htmlFor={reasonSelectId}
            className="block text-[10px] font-bold uppercase tracking-wider text-blue-100/60"
          >
            Restriction Reason
          </label>
          <div className="relative mt-1">
            <select
              id={reasonSelectId}
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="w-full appearance-none rounded-xl border border-white/10 bg-[#07143d] px-3 py-2 text-xs text-white focus:border-cyan-300 focus:outline-none"
            >
              <option value="ALL">All reasons</option>
              <option value="CROSS_ROLE_DENIED">Cross-role restricted</option>
              <option value="MISSING_MODULE">Permission missing</option>
              <option value="CROSS_TENANT_DENIED">Tenant boundary</option>
              <option value="FEATURE_FLAG_DISABLED">System control off</option>
              <option value="SUSPENDED_PRODUCER">Suspended account</option>
              <option value="INVALID_WORKER_SIGNATURE">Worker signature</option>
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-2.5 text-blue-100/40"
            />
          </div>
        </div>

        {/* Role */}
        <div>
          <label
            htmlFor={roleSelectId}
            className="block text-[10px] font-bold uppercase tracking-wider text-blue-100/60"
          >
            Account Role
          </label>
          <div className="relative mt-1">
            <select
              id={roleSelectId}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full appearance-none rounded-xl border border-white/10 bg-[#07143d] px-3 py-2 text-xs text-white focus:border-cyan-300 focus:outline-none"
            >
              <option value="ALL">All account roles</option>
              <option value="anonymous">Anonymous</option>
              <option value="viewer">Viewer</option>
              <option value="producer">Producer</option>
              <option value="provider">Provider</option>
              <option value="admin">Administrator</option>
              <option value="worker">Background worker</option>
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-2.5 text-blue-100/40"
            />
          </div>
        </div>

        {/* Platform */}
        <div>
          <label
            htmlFor={platformSelectId}
            className="block text-[10px] font-bold uppercase tracking-wider text-blue-100/60"
          >
            Platform / Client
          </label>
          <div className="relative mt-1">
            <select
              id={platformSelectId}
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="w-full appearance-none rounded-xl border border-white/10 bg-[#07143d] px-3 py-2 text-xs text-white focus:border-cyan-300 focus:outline-none"
            >
              <option value="ALL">All platforms</option>
              <option value="web">Web browser</option>
              <option value="android">Android app</option>
              <option value="ios">Apple iOS app</option>
              <option value="worker">Background worker</option>
              <option value="unknown">Unspecified</option>
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-2.5 text-blue-100/40"
            />
          </div>
        </div>

        {/* Route Pattern Search */}
        <div className="sm:col-span-2">
          <label
            htmlFor={searchInputId}
            className="block text-[10px] font-bold uppercase tracking-wider text-blue-100/60"
          >
            Route Pattern Match
          </label>
          <div className="mt-1 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                id={searchInputId}
                type="text"
                value={routePatternFilter}
                onChange={(e) => setRoutePatternFilter(e.target.value)}
                placeholder="e.g. /admin/overview or /channels"
                className="w-full rounded-xl border border-white/10 bg-[#07143d] pl-9 pr-3 py-2 text-xs text-white placeholder-blue-100/30 focus:border-cyan-300 focus:outline-none"
              />
              <Search
                size={14}
                className="absolute left-3 top-2.5 text-blue-100/40"
                aria-hidden="true"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-[#031039] hover:bg-cyan-200"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              title="Reset all filters"
              aria-label="Reset all filters"
              className="rounded-xl border border-white/10 bg-[#07143d] p-2 text-xs text-blue-100/60 hover:text-white"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </form>

      {/* Status / Error Notifications */}
      {error ? (
        <div
          role="alert"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4 text-xs text-rose-200"
        >
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Events Table / List */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#030b2a]">
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[700px] text-left text-xs"
            aria-label="Access denial events table"
          >
            <thead className="border-b border-white/10 bg-[#051139] text-[11px] font-bold uppercase tracking-wider text-cyan-200">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Timestamp
                </th>
                <th scope="col" className="px-4 py-3">
                  Reason
                </th>
                <th scope="col" className="px-4 py-3">
                  Role & Client
                </th>
                <th scope="col" className="px-4 py-3">
                  Route Pattern
                </th>
                <th scope="col" className="px-4 py-3">
                  Hashed Actor
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-blue-100/50">
                    Loading security events…
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-blue-100/50">
                    No access denial events found matching the active filters.
                  </td>
                </tr>
              ) : (
                events.map((event) => {
                  const isCopied = copiedHash === event.id;
                  return (
                    <tr key={event.id} className="transition hover:bg-white/[0.02]">
                      {/* Timestamp */}
                      <td className="px-4 py-3 text-blue-100/70 whitespace-nowrap">
                        <div className="font-mono text-[11px]">{formatEventTime(event.time)}</div>
                        <div className="text-[10px] text-blue-100/40 font-mono">{event.method}</div>
                      </td>

                      {/* Reason */}
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">
                          {formatReason(event.reasonCode)}
                        </span>
                        {event.requiredRole ? (
                          <div className="mt-0.5 text-[10px] text-blue-100/40">
                            Required: {event.requiredRole}
                          </div>
                        ) : null}
                      </td>

                      {/* Role & Client */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 font-semibold text-white">
                          <PlatformIcon platform={event.platformClass} />
                          <span className="capitalize">{event.actorRoleClass}</span>
                        </div>
                        <div className="text-[10px] text-blue-100/40 capitalize">
                          {event.platformClass}
                        </div>
                      </td>

                      {/* Route Pattern */}
                      <td className="px-4 py-3 font-mono text-[11px] text-blue-200">
                        <div className="max-w-[200px] truncate" title={event.routePattern}>
                          {event.routePattern}
                        </div>
                      </td>

                      {/* Hashed Actor */}
                      <td className="px-4 py-3 font-mono text-[11px] text-blue-100/60">
                        <div className="flex items-center gap-1.5">
                          <span title={event.actorHash}>
                            {event.actorHash.slice(0, 10)}…{event.actorHash.slice(-6)}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(event.actorHash, event.id)}
                            title="Copy full actor hash"
                            aria-label="Copy full actor hash"
                            className="text-blue-100/40 hover:text-cyan-200"
                          >
                            {isCopied ? (
                              <CheckCircle2 size={13} className="text-emerald-400" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        {isOwner ? (
                          <button
                            type="button"
                            onClick={() => openLookupModal(event.actorHash)}
                            aria-label={`Look up account for actor hash ${event.actorHash.slice(0, 8)}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[11px] font-bold text-cyan-200 transition hover:bg-cyan-300 hover:text-[#031039]"
                          >
                            <UserCheck size={13} aria-hidden="true" />
                            Look up
                          </button>
                        ) : (
                          <span
                            title="Only the verified platform owner can resolve account identities."
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-100/30"
                          >
                            <Lock size={12} aria-hidden="true" />
                            Owner only
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Step-Up Verification & Actor Lookup Modal */}
      {lookupTargetHash ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lookup-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg rounded-3xl border border-cyan-300/30 bg-[#051139] p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200">
                  <UserCheck size={18} />
                </span>
                <div>
                  <h3 id="lookup-dialog-title" className="text-lg font-black text-white">
                    Audited Identity Lookup
                  </h3>
                  <p className="text-xs text-blue-100/60">Platform owner step-up authorization</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeLookupModal}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-blue-100/50 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Target Hash Info */}
            <div className="mt-4 rounded-xl border border-white/10 bg-[#030b2a] p-3 text-xs">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-100/40">
                Hashed Security Identifier
              </span>
              <p className="mt-1 font-mono text-[11px] text-cyan-200 break-all select-all">
                {lookupTargetHash}
              </p>
            </div>

            {/* Lookup Result (if already completed) */}
            {lookupResult ? (
              <div className="mt-4 rounded-2xl border border-cyan-300/30 bg-[#071e54] p-4 text-xs">
                {lookupResult.found && lookupResult.account ? (
                  <div>
                    <div className="flex items-center gap-2 text-emerald-400 font-bold">
                      <CheckCircle2 size={16} />
                      <span>Account successfully resolved</span>
                    </div>
                    <dl className="mt-3 grid gap-2 text-xs">
                      <div>
                        <dt className="text-[10px] text-blue-100/50 uppercase">
                          Account Identifier
                        </dt>
                        <dd className="font-mono text-white">{lookupResult.account.uid}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-blue-100/50 uppercase">Email Address</dt>
                        <dd className="font-semibold text-white">
                          {lookupResult.account.email || "No email on record"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-blue-100/50 uppercase">Account Roles</dt>
                        <dd className="text-cyan-200 capitalize">
                          {lookupResult.account.roleTags.join(", ") || "Standard viewer"}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-4 rounded-lg bg-emerald-500/10 p-2 text-[11px] text-emerald-300">
                      Permanent audit entry written to platform ledger.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-amber-200">
                      No account matches this identifier.
                    </p>
                    <p className="mt-1 text-blue-100/60 text-[11px]">
                      The access denial may originate from an unauthenticated request or expired
                      credentials. Audit entry recorded.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={closeLookupModal}
                  className="mt-4 w-full rounded-xl bg-cyan-300 py-2.5 text-xs font-bold text-[#031039]"
                >
                  Done
                </button>
              </div>
            ) : (
              /* Step-Up Confirmation Form */
              <form onSubmit={executeActorLookup} className="mt-4 grid gap-4">
                <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100/80">
                  <strong>Notice:</strong> Resolving a security identifier reveals account details
                  and is recorded in the permanent platform audit log.
                </div>

                <div>
                  <label htmlFor={lookupReasonId} className="block text-xs font-bold text-white">
                    Reason for identity lookup (required)
                  </label>
                  <p className="text-[11px] text-blue-100/50">
                    Describe the security inquiry (recorded in the tamper-evident audit ledger).
                  </p>
                  <textarea
                    id={lookupReasonId}
                    required
                    minLength={3}
                    maxLength={1000}
                    value={lookupReason}
                    onChange={(e) => setLookupReason(e.target.value)}
                    placeholder="e.g. Investigating repeated unauthorized access spikes"
                    rows={2}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#030b2a] p-3 text-xs text-white placeholder-blue-100/30 focus:border-cyan-300 focus:outline-none"
                  />
                </div>

                <label
                  htmlFor={stepUpCheckId}
                  className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#030b2a] p-3 cursor-pointer"
                >
                  <input
                    id={stepUpCheckId}
                    type="checkbox"
                    checked={stepUpConfirmed}
                    onChange={(e) => setStepUpConfirmed(e.target.checked)}
                    className="mt-0.5 size-4 accent-cyan-300"
                  />
                  <span className="text-xs leading-5 text-blue-100/80">
                    I confirm that I am the verified platform owner and authorize this identity
                    resolution under platform audit rules.
                  </span>
                </label>

                {lookupError ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-xs text-rose-200"
                  >
                    {lookupError}
                  </p>
                ) : null}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeLookupModal}
                    className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-blue-100/70 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={lookupBusy || lookupReason.trim().length < 3 || !stepUpConfirmed}
                    className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-2.5 text-xs font-black text-[#031039] hover:opacity-95 disabled:opacity-40"
                  >
                    {lookupBusy ? "Verifying & resolving…" : "Confirm & look up"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
