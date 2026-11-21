import React, { useState } from "react";
import { CheckCircle2, Clock, AlertTriangle, ShieldCheck, Mail, HelpCircle, ArrowRight } from "lucide-react";
import { getKycString } from "@/lib/kyc-strings";
import { KycSupportModal } from "@/components/kyc/KycSupportModal";

export interface KycStatusTimelineProps {
  currentStatus: "unsubmitted" | "pending" | "needs_changes" | "approved" | "rejected" | "rekyc_required" | "expired";
  submittedAt?: string | null;
  reviewedAt?: string | null;
  expiresAt?: string | null;
  rejectionReason?: string | null;
  needsChangesReason?: string | null;
  onStartReverification?: () => void;
  authToken?: string;
  applicantUid?: string;
}

export function KycStatusTimeline({
  currentStatus,
  submittedAt,
  reviewedAt,
  expiresAt,
  rejectionReason,
  needsChangesReason,
  onStartReverification,
  authToken,
  applicantUid,
}: KycStatusTimelineProps) {
  const [showSupport, setShowSupport] = useState(false);

  const steps = [
    {
      id: "submitted",
      title: "1. Application Submitted",
      desc: "Your personal details, government ID, and face verification photo were successfully received.",
      emailNotice: "Email sent: Application Received Confirmation",
      isComplete: currentStatus !== "unsubmitted",
      isActive: currentStatus === "unsubmitted",
      date: submittedAt,
    },
    {
      id: "review",
      title: "2. Compliance Review",
      desc: "Standard regulatory and anti-fraud verification checks are performed.",
      emailNotice: "Email sent: Review In Progress Notice",
      isComplete: ["approved", "needs_changes", "rejected", "rekyc_required", "expired"].includes(currentStatus),
      isActive: currentStatus === "pending",
      date: currentStatus === "pending" ? submittedAt : null,
    },
    {
      id: "decision",
      title: currentStatus === "needs_changes" ? "3. Additional Information Required" : "3. Verification Decision",
      desc:
        currentStatus === "approved"
          ? "Identity successfully approved. Creator settlements and payouts are active."
          : currentStatus === "needs_changes"
          ? needsChangesReason || "Please update specific documents or details to complete approval."
          : currentStatus === "rejected"
          ? rejectionReason || "Verification could not be completed with the provided credentials."
          : "Final compliance confirmation and payout activation.",
      emailNotice:
        currentStatus === "approved"
          ? "Email sent: Verification Approved & Settlement Activated"
          : currentStatus === "needs_changes"
          ? "Email sent: Information Update Request"
          : currentStatus === "rejected"
          ? "Email sent: Verification Status Update"
          : "Email sent upon completion",
      isComplete: ["approved", "rejected"].includes(currentStatus),
      isActive: ["needs_changes", "approved", "rejected"].includes(currentStatus),
      date: reviewedAt,
      error: currentStatus === "rejected" || currentStatus === "needs_changes",
    },
  ];

  return (
    <div className="space-y-6 rounded-2xl border border-white/10 bg-[#061234] p-5 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-200">Verification Progress Timeline</h3>
          <p className="text-xs text-slate-400">
            Track your identity verification status and dispatched security emails.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSupport(true)}
          className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
        >
          <HelpCircle className="h-4 w-4 text-cyan-400" />
          <span>Ask about my verification</span>
        </button>
      </div>

      {/* Timeline Steps */}
      <div className="relative space-y-6 ps-6 before:absolute before:start-2.5 before:top-2 before:h-[calc(100%-16px)] before:w-0.5 before:bg-slate-700">
        {steps.map((st) => (
          <div key={st.id} className="relative space-y-1">
            {/* Timeline icon */}
            <div
              className={`absolute -start-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                st.error
                  ? "bg-amber-500 text-black font-bold"
                  : st.isComplete
                  ? "bg-emerald-500 text-black font-bold"
                  : st.isActive
                  ? "bg-cyan-500 text-black font-bold animate-pulse"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {st.error ? (
                <AlertTriangle className="h-3 w-3" />
              ) : st.isComplete ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-bold ${st.isActive ? "text-cyan-300" : "text-slate-200"}`}>
                {st.title}
              </span>
              {st.date && (
                <span className="text-[10px] text-slate-400">
                  {new Date(st.date).toLocaleDateString()}
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300">{st.desc}</p>

            {/* Email dispatch badge */}
            <div className="flex items-center gap-1.5 text-[11px] text-cyan-400/90 pt-0.5">
              <Mail className="h-3 w-3" />
              <span>{st.emailNotice}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Re-KYC / Expiry Callout if applicable */}
      {(currentStatus === "expired" || currentStatus === "rekyc_required") && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-center justify-between gap-3">
          <div>
            <strong className="block text-white">Periodic Re-Verification Due</strong>
            <span>Your identity document has expired or regulatory re-verification is required.</span>
          </div>
          {onStartReverification && (
            <button
              onClick={onStartReverification}
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-300 transition"
            >
              Update ID
            </button>
          )}
        </div>
      )}

      {/* Support Ticket Modal */}
      {showSupport && (
        <KycSupportModal
          onClose={() => setShowSupport(false)}
          {...(authToken ? { authToken } : {})}
          {...(applicantUid ? { applicantUid } : {})}
          currentStatus={currentStatus}
        />
      )}
    </div>
  );
}
