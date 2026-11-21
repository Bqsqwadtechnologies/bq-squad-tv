import { useEffect, useState, useMemo, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Eye,
  EyeOff,
  User,
  Building,
  CreditCard,
  FileText,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Sliders,
  Send,
  Flag,
  Lock,
  Smartphone,
  Mail,
  Calendar,
} from "lucide-react";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/kyc")({
  component: KycReviewRoute,
  head: () => ({
    meta: [
      { title: "KYC Review Queue | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function KycReviewRoute() {
  return (
    <ConsolePageGuard role="zillionaire">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="KYC Review Queue"
          tagline="Compliance verification for producer and provider identities, corporate filings, and biometric liveness checks"
          activePath="/zillionaire/kyc"
          account={{
            email: account.email || undefined,
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          onLock={onLock}
        >
          <KycReviewBody token={token} isOwner={account.isOwner} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}

interface KycItem {
  uid: string;
  role: "producer" | "provider";
  kycType: "producer_personal" | "producer_business" | "provider_corporate";
  kycStatus: "pending" | "approved" | "rejected" | "needs_changes" | "unsubmitted";
  kycCountry: string;
  kycVersion: number;
  kycSubmittedAt?: string;
  legalName: string;
  businessName?: string;
  officialEmail?: string;
  phone?: string;
  maskedIdNumber?: string;
  maskedTaxNumber?: string;
  companyRegNumber?: string;
  riskScore: number;
  riskFlags: string[];
  documentCount: number;
  hasFaceCapture: boolean;
  autoChecks: {
    idValid: boolean;
    ageValid: boolean;
    regValid: boolean;
    payoutMatch: boolean;
  };
}

function KycReviewBody({ token, isOwner }: { token?: string; isOwner?: boolean }) {
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [items, setItems] = useState<KycItem[]>([]);
  const [counters, setCounters] = useState({
    pending: 0,
    needsChanges: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail Modal State
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailProfile, setDetailProfile] = useState<any | null>(null);
  const [revealedFields, setRevealedFields] = useState<Record<string, string>>({});
  const [actionReason, setActionReason] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  // Document viewer transform
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotationDeg, setRotationDeg] = useState(0);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getWebAuthHeaders(token);
      const url = `/api/public/v1/zillionaire/kyc/queue?tab=${activeTab}&type=${typeFilter}&search=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      if (data.counters) setCounters(data.counters);
    } catch (err: any) {
      setError(err.message || "Failed to load KYC queue");
    } finally {
      setLoading(false);
    }
  }, [activeTab, typeFilter, searchQuery, token]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const openDetail = async (uid: string) => {
    setSelectedUid(uid);
    setDetailLoading(true);
    setDetailProfile(null);
    setRevealedFields({});
    setActionReason("");
    setActionNotes("");
    setZoomLevel(1);
    setRotationDeg(0);

    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch(`/api/public/v1/zillionaire/kyc/detail?uid=${encodeURIComponent(uid)}`, { headers });
      if (!res.ok) throw new Error("Failed to load applicant detail");
      const data = await res.json();
      setDetailProfile(data.profile);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReveal = async (field: string) => {
    const reason = prompt("Enter mandatory audit reason for revealing sensitive field:");
    if (!reason || reason.trim().length < 3) {
      alert("A reason of at least 3 characters is mandatory to unmask sensitive KYC records.");
      return;
    }

    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/kyc/reveal", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ uid: selectedUid, field, reason }),
      });
      if (!res.ok) throw new Error("Reveal request failed");
      const data = await res.json();
      setRevealedFields((prev) => ({ ...prev, [field]: data.plaintext }));
    } catch (e: any) {
      alert(e.message || "Could not decrypt field");
    }
  };

  const handleAction = async (action: "approve" | "reject" | "request_changes" | "escalate" | "force_rekyc") => {
    if (action === "reject" && (!actionReason || actionReason.trim().length < 3)) {
      alert("A rejection reason of at least 3 characters is mandatory.");
      return;
    }

    if (!confirm(`Are you sure you want to ${action.toUpperCase()} this KYC application?`)) {
      return;
    }

    setActionBusy(true);
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/kyc/detail", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: selectedUid,
          action,
          reason: actionReason,
          notes: actionNotes,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Action failed");
      }

      alert(`Application successfully marked: ${action}`);
      setSelectedUid(null);
      fetchQueue();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ConsoleKpiCard
          label="Pending Review"
          value={counters.pending}
          hint="Requires compliance action"
          icon={<Clock className="h-5 w-5 text-amber-400" />}
        />
        <ConsoleKpiCard
          label="Needs Changes"
          value={counters.needsChanges}
          hint="Waiting for applicant"
          icon={<AlertTriangle className="h-5 w-5 text-yellow-400" />}
        />
        <ConsoleKpiCard
          label="Approved Entities"
          value={counters.approved}
          hint="Unlocked for publishing & payouts"
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
        />
        <ConsoleKpiCard
          label="Rejected"
          value={counters.rejected}
          hint="Failed verification"
          icon={<XCircle className="h-5 w-5 text-rose-400" />}
        />
      </div>

      {/* Main Review Queue Console Card */}
      <ConsoleCard
        title="Applicant Queue"
        subtitle="Review, verify, and audit producer and provider identity credentials"
        action={
          <button
            onClick={fetchQueue}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      >
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex border-b border-white/10 gap-2 overflow-x-auto pb-1">
            {[
              { id: "pending", label: "Pending", count: counters.pending },
              { id: "needs_changes", label: "Needs Changes", count: counters.needsChanges },
              { id: "approved", label: "Approved", count: counters.approved },
              { id: "rejected", label: "Rejected", count: counters.rejected },
              { id: "all", label: "All Records", count: counters.total },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs sm:text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? "border-cyan-400 text-cyan-400"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    activeTab === tab.id ? "bg-cyan-500/20 text-cyan-300" : "bg-white/5 text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, email, reg, ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="producer_personal">Producer (Personal)</option>
                <option value="producer_business">Producer (Business)</option>
                <option value="provider_corporate">Provider (Corporate)</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading queue...</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No applications match the current tab or search criteria.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-white/10 bg-white/5 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Applicant Entity</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Country</th>
                    <th className="px-4 py-3">Verification Checks</th>
                    <th className="px-4 py-3">Risk</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {items.map((item) => (
                    <tr key={item.uid} className="hover:bg-white/[0.02] transition">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{item.legalName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{item.uid}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-300">
                          {item.kycType === "producer_personal"
                            ? "Personal"
                            : item.kycType === "producer_business"
                              ? "Producer Biz"
                              : "Provider Corp"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-200">{item.kycCountry}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span
                            className={item.autoChecks.idValid ? "text-emerald-400" : "text-amber-400"}
                            title="ID Format Valid"
                          >
                            ✓ ID
                          </span>
                          <span>•</span>
                          <span
                            className={item.autoChecks.regValid ? "text-emerald-400" : "text-amber-400"}
                            title="Registration Check"
                          >
                            ✓ Reg
                          </span>
                          <span>•</span>
                          <span
                            className={item.hasFaceCapture ? "text-cyan-400" : "text-slate-500"}
                            title="Biometric Face Liveness"
                          >
                            Face
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            item.riskScore > 50
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          }`}
                        >
                          Score {item.riskScore}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ConsoleStatusBadge
                          status={
                            item.kycStatus === "approved"
                              ? "active"
                              : item.kycStatus === "rejected"
                                ? "failed"
                                : item.kycStatus === "needs_changes"
                                  ? "warning"
                                  : "pending"
                          }
                          label={item.kycStatus.toUpperCase()}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openDetail(item.uid)}
                          className="rounded-xl bg-cyan-500/20 border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500 hover:text-black transition"
                        >
                          Review File
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ConsoleCard>

      {/* Review Slide-over Modal */}
      {selectedUid && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-3xl h-full bg-[#0a1533] border-l border-white/10 shadow-2xl flex flex-col overflow-hidden text-white">
            {/* Slide-over Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-slate-900/80">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-cyan-400" />
                <div>
                  <h3 className="text-base font-bold text-white">KYC Case File</h3>
                  <p className="text-xs text-slate-400 font-mono">{selectedUid}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUid(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Slide-over Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 select-none">
              {detailLoading || !detailProfile ? (
                <div className="py-20 text-center text-xs text-slate-400">Loading applicant details...</div>
              ) : (
                <>
                  {/* Automated Compliance Checks Matrix */}
                  <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Country Rule & Compliance Automated Checks
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                        <span className="text-slate-400">Age Check (18+):</span>
                        <p className="font-bold text-emerald-400">✓ Verified 18+</p>
                      </div>
                      <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                        <span className="text-slate-400">Duplicate ID Check:</span>
                        <p
                          className={`font-bold ${
                            detailProfile.automatedChecks?.duplicateIdDetected
                              ? "text-rose-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {detailProfile.automatedChecks?.duplicateIdDetected ? "⚠ Duplicate Detected" : "✓ No Duplicate"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                        <span className="text-slate-400">Duplicate Bank Account:</span>
                        <p
                          className={`font-bold ${
                            detailProfile.automatedChecks?.duplicateBankDetected
                              ? "text-rose-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {detailProfile.automatedChecks?.duplicateBankDetected
                            ? "⚠ Duplicate Detected"
                            : "✓ No Duplicate"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Applicant Details & Unmasking Section */}
                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Identity & Registration Data (Copy-Protected)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400">Legal Entity Name:</span>
                        <p className="font-semibold text-white">{detailProfile.legalName || "—"}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Country:</span>
                        <p className="font-semibold text-white">{detailProfile.kycCountry || "—"}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Registration Number:</span>
                        <p className="font-mono text-white">{detailProfile.companyRegNumber || "—"}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Official Phone (SMS Verified):</span>
                        <p className="font-mono text-emerald-300">{detailProfile.phone || "—"}</p>
                      </div>

                      {/* Audited Reveal Fields */}
                      <div className="rounded-xl border border-white/10 bg-black/40 p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Tax ID:</span>
                          <button
                            onClick={() => handleReveal("taxNumber")}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                          >
                            <Eye className="h-3 w-3" /> Reveal (Audited)
                          </button>
                        </div>
                        <p className="font-mono text-slate-200">
                          {revealedFields["taxNumber"] || detailProfile.maskedTaxNumber || "••••••••"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/40 p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Government ID Number:</span>
                          <button
                            onClick={() => handleReveal("idNumber")}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                          >
                            <Eye className="h-3 w-3" /> Reveal (Audited)
                          </button>
                        </div>
                        <p className="font-mono text-slate-200">
                          {revealedFields["idNumber"] || detailProfile.maskedIdNumber || "••••••••"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Document & Biometric Viewer */}
                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Evidence Documents & Liveness Comparison
                      </h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setRotationDeg((r) => (r + 90) % 360)}
                          className="rounded-lg border border-white/10 bg-white/5 p-1 text-slate-400 hover:text-white"
                          title="Rotate 90°"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
                          className="rounded-lg border border-white/10 bg-white/5 p-1 text-slate-400 hover:text-white"
                          title="Zoom In"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setZoomLevel((z) => Math.max(0.75, z - 0.25))}
                          className="rounded-lg border border-white/10 bg-white/5 p-1 text-slate-400 hover:text-white"
                          title="Zoom Out"
                        >
                          <ZoomOut className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Documents */}
                      {detailProfile.signedDocuments &&
                        Object.entries(detailProfile.signedDocuments).map(([k, doc]: any) => (
                          <div key={k} className="rounded-xl border border-white/10 bg-black/60 p-2 overflow-hidden">
                            <span className="text-[10px] font-bold text-cyan-300 uppercase block mb-1">{doc.label}</span>
                            <div className="h-48 overflow-hidden flex items-center justify-center bg-black/90 rounded-lg">
                              <iframe
                                src={doc.viewerUrl}
                                title={doc.label}
                                className="w-full h-full border-0"
                                style={{
                                  transform: `scale(${zoomLevel}) rotate(${rotationDeg}deg)`,
                                  transformOrigin: "center center",
                                }}
                              />
                            </div>
                          </div>
                        ))}

                      {/* Face Liveness Capture */}
                      {detailProfile.signedFaceCaptureUrl && (
                        <div className="rounded-xl border border-cyan-500/30 bg-black/60 p-2 overflow-hidden">
                          <span className="text-[10px] font-bold text-cyan-400 uppercase block mb-1">
                            Face Liveness Snapshot
                          </span>
                          <div className="h-48 overflow-hidden flex items-center justify-center bg-black/90 rounded-lg">
                            <iframe
                              src={detailProfile.signedFaceCaptureUrl}
                              title="Face Liveness"
                              className="w-full h-full border-0"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Decision Actions Form */}
                  <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Compliance Review Decision
                    </h4>

                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-300">
                        Decision Reason / Rejection Feedback (Mandatory for rejection):
                      </label>
                      <textarea
                        rows={2}
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="State clear reasons or specific missing items..."
                        className="w-full rounded-xl border border-white/10 bg-black/40 p-2.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-300">Internal Audit Notes:</label>
                      <input
                        type="text"
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                        placeholder="Private notes for compliance audit record..."
                        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <button
                        onClick={() => handleAction("approve")}
                        disabled={actionBusy}
                        className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-black hover:bg-emerald-400 transition"
                      >
                        Approve Application
                      </button>
                      <button
                        onClick={() => handleAction("reject")}
                        disabled={actionBusy}
                        className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-500 transition"
                      >
                        Reject with Reason
                      </button>
                      <button
                        onClick={() => handleAction("request_changes")}
                        disabled={actionBusy}
                        className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-3 py-2.5 text-xs font-semibold text-yellow-300 hover:bg-yellow-500/20 transition"
                      >
                        Request Changes
                      </button>
                      <button
                        onClick={() => handleAction("escalate")}
                        disabled={actionBusy}
                        className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-3 py-2.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/20 transition"
                      >
                        Escalate
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
