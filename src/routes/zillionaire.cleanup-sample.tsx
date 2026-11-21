import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileCheck,
  Flame,
  HardDrive,
  Lock,
  PlaySquare,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Tv2,
} from "lucide-react";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
} from "@/components/ConsoleShell";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/cleanup-sample")({
  component: ZillionaireCleanupSampleRoute,
  head: () => ({
    meta: [
      { title: "Clean Up Sample Content | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

type SampleItem = {
  collection: string;
  id: string;
  title: string;
  reason: string;
  sizeBytes?: number;
};

type ScanResult = {
  dryRun: boolean;
  totalRecordsFound: number;
  channelsFound: number;
  contentAssetsFound: number;
  seriesFound: number;
  episodesFound: number;
  storageDestinationsFound: number;
  storageObjectsFound: number;
  estimatedBytesFreed: number;
  sampleItems: SampleItem[];
};

type CleanupResult = {
  dryRun: boolean;
  success: boolean;
  reportId: string;
  totalRecordsDeleted: number;
  channelsDeleted: number;
  contentAssetsDeleted: number;
  seriesDeleted: number;
  episodesDeleted: number;
  storageDestinationsDeleted: number;
  storageObjectsDeleted: number;
  estimatedBytesFreed: number;
  executedAt: string;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function ZillionaireCleanupSampleRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="system">
      {({ token, account, onLock }) => (
        <CleanupSampleContentInner token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function CleanupSampleContentInner({
  token,
  account,
  onLock,
}: {
  token: string | null;
  account: { uid: string; email?: string; displayName?: string };
  onLock: () => void;
}) {
  const [isScanning, setIsScanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form controls
  const [password, setPassword] = useState("");
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [reason, setReason] = useState("");

  const handleScanDryRun = async () => {
    setIsScanning(true);
    setError(null);
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/cleanup-sample", {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify({ dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to scan sample records.");
      }
      setScanResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error performing dry-run scan.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleExecuteCleanup = async () => {
    if (typedConfirmation !== "DELETE_SAMPLE_CONTENT") {
      setError('You must type "DELETE_SAMPLE_CONTENT" exactly to confirm execution.');
      return;
    }
    if (reason.trim().length < 5) {
      setError("Please provide a valid reason of at least 5 characters.");
      return;
    }
    if (!password) {
      setError("Owner step-up password is required to authorize permanent deletion.");
      return;
    }

    setIsExecuting(true);
    setError(null);

    try {
      const headers = await getWebAuthHeaders(token);

      // 1. Obtain step-up token for permanent_delete scope
      const stepUpRes = await fetch("/api/public/v1/zillionaire/access/step-up", {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          password,
          scope: "permanent_delete",
        }),
      });

      const stepUpData = await stepUpRes.json();
      if (!stepUpRes.ok || !stepUpData.token) {
        throw new Error(
          stepUpData.error?.message || "Invalid owner step-up password or re-authentication failed.",
        );
      }

      // 2. Execute deletion with step-up token
      const res = await fetch("/api/public/v1/zillionaire/cleanup-sample", {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "x-zillionaire-step-up": stepUpData.token,
        },
        body: JSON.stringify({
          dryRun: false,
          confirmation: typedConfirmation,
          reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Sample content deletion failed.");
      }

      setCleanupResult(data);
      // Refresh scan result to show 0
      setScanResult({
        dryRun: false,
        totalRecordsFound: 0,
        channelsFound: 0,
        contentAssetsFound: 0,
        seriesFound: 0,
        episodesFound: 0,
        storageDestinationsFound: 0,
        storageObjectsFound: 0,
        estimatedBytesFreed: 0,
        sampleItems: [],
      });
      setPassword("");
      setTypedConfirmation("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error executing permanent cleanup.");
    } finally {
      setIsExecuting(false);
    }
  };

  const isFormValid =
    typedConfirmation === "DELETE_SAMPLE_CONTENT" &&
    reason.trim().length >= 5 &&
    password.length > 0 &&
    scanResult !== null;

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Zillionaire Console"
      tagline="Platform Maintenance & Sample Content Cleanup"
      account={account}
      activePath="/zillionaire/cleanup-sample"
      onLock={onLock}
      onRefresh={handleScanDryRun}
      isRefreshing={isScanning}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <ConsoleWelcomeBanner
          title="Clean Up Sample Content"
          description="Identify and permanently purge all demo/seeded movies, series, channels, storage artifacts, and test records to ensure truthful production operation."
          badge="High Impact"
        />

        {/* Warning Callout */}
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-5 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Permanent Deletion Warning</h4>
              <p className="text-xs text-rose-200/90 leading-relaxed">
                This operation permanently deletes sample content records from the database and cleans up associated
                storage metadata. To prevent accidental data loss, a dry-run scan must be reviewed first,
                followed by owner step-up password verification and exact typed confirmation.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/20 p-4 text-xs font-semibold text-rose-300">
            {error}
          </div>
        )}

        {cleanupResult && (
          <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6 backdrop-blur-xl space-y-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <h4 className="text-sm font-bold">Sample Content Purged Successfully</h4>
            </div>
            <p className="text-xs text-slate-300">
              Purged {cleanupResult.totalRecordsDeleted} records and freed approximately{" "}
              {formatBytes(cleanupResult.estimatedBytesFreed)} of storage space. An immutable audit record has been
              committed.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-2 border-t border-emerald-500/20">
              <span>Report ID: <code className="text-emerald-300 font-mono">{cleanupResult.reportId}</code></span>
              <span>Executed at: {new Date(cleanupResult.executedAt).toLocaleString()}</span>
              <Link
                to="/zillionaire/audit"
                className="text-cyan-400 font-bold hover:underline inline-flex items-center gap-1"
              >
                <FileCheck className="h-3.5 w-3.5" /> View in Audit Log
              </Link>
            </div>
          </div>
        )}

        {/* Action Controls Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <ConsoleCard title="Cleanup Workflow & Authorization" description="Two-step verified cleanup">
              <div className="space-y-5">
                {/* Step 1: Dry run */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-400/20 text-xs font-bold text-cyan-300">
                        1
                      </span>
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Perform Dry-Run Scan
                      </span>
                    </div>
                    {scanResult && (
                      <span className="text-[11px] font-bold text-emerald-400">
                        {scanResult.totalRecordsFound} sample items detected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Scans database collections for records with demo flags, fixture IDs, system seed titles, and
                    mock storage destinations without modifying or deleting anything.
                  </p>
                  <button
                    type="button"
                    onClick={handleScanDryRun}
                    disabled={isScanning || isExecuting}
                    className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] shadow-md shadow-cyan-400/20 hover:brightness-110 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin" : ""}`} />
                    <span>{isScanning ? "Scanning Database..." : "Run Dry-Run Scan"}</span>
                  </button>
                </div>

                {/* Step 2: Step-up and Confirmation */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-rose-500/20 text-xs font-bold text-rose-300">
                      2
                    </span>
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Authorise Permanent Deletion
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                        Reason for Deletion (min. 5 chars)
                      </label>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Purging pre-launch demo fixtures for production compliance"
                        className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-400"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                        Owner Step-Up Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your Zillionaire access password"
                          className="w-full rounded-xl border border-white/10 bg-[#030b2a] pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                        Type <code className="text-rose-400 font-mono">DELETE_SAMPLE_CONTENT</code> to confirm
                      </label>
                      <input
                        type="text"
                        value={typedConfirmation}
                        onChange={(e) => setTypedConfirmation(e.target.value)}
                        placeholder="DELETE_SAMPLE_CONTENT"
                        className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-400 font-mono"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleExecuteCleanup}
                      disabled={!isFormValid || isExecuting || isScanning}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-500/20 hover:brightness-110 disabled:opacity-50 transition"
                    >
                      <Flame className="h-4 w-4" />
                      <span>{isExecuting ? "Executing Permanent Cleanup..." : "Execute Permanent Cleanup"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </ConsoleCard>
          </div>

          {/* Quick Metrics Side Column */}
          <div className="space-y-4">
            <ConsoleKpiCard
              title="Channels"
              value={scanResult ? String(scanResult.channelsFound) : "—"}
              caption="Live demo channel fixtures"
              icon={Tv2}
            />
            <ConsoleKpiCard
              title="Media Assets"
              value={scanResult ? String(scanResult.contentAssetsFound) : "—"}
              caption="Movies & video fixtures"
              icon={PlaySquare}
            />
            <ConsoleKpiCard
              title="Series & Episodes"
              value={
                scanResult
                  ? String(scanResult.seriesFound + scanResult.episodesFound)
                  : "—"
              }
              caption="Sample seasons & episodes"
              icon={Database}
            />
            <ConsoleKpiCard
              title="Est. Space to Free"
              value={scanResult ? formatBytes(scanResult.estimatedBytesFreed) : "—"}
              caption="Sample storage artifacts"
              icon={HardDrive}
            />
          </div>
        </div>

        {/* Detailed Findings Table */}
        {scanResult && scanResult.sampleItems.length > 0 && (
          <ConsoleCard
            title={`Detected Sample Items (${scanResult.sampleItems.length})`}
            description="Items identified by demo flags, fixture IDs, or mock storage paths"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-2.5 px-3">Collection</th>
                    <th className="py-2.5 px-3">Identifier</th>
                    <th className="py-2.5 px-3">Title / Path</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3 text-right">Est. Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {scanResult.sampleItems.map((item) => (
                    <tr key={`${item.collection}_${item.id}`} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 font-semibold text-cyan-300 capitalize">{item.collection}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">{item.id}</td>
                      <td className="py-2.5 px-3 text-white font-medium">{item.title}</td>
                      <td className="py-2.5 px-3 text-slate-400">{item.reason}</td>
                      <td className="py-2.5 px-3 text-right text-slate-300 font-mono">
                        {item.sizeBytes ? formatBytes(item.sizeBytes) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ConsoleCard>
        )}
      </div>
    </ConsoleShell>
  );
}
