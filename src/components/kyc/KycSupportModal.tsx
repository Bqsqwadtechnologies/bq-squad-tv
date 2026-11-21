import React, { useState } from "react";
import { HelpCircle, X, Send, CheckCircle2, AlertCircle } from "lucide-react";

export interface KycSupportModalProps {
  onClose: () => void;
  authToken?: string;
  applicantUid?: string;
  currentStatus?: string;
}

export function KycSupportModal({
  onClose,
  authToken,
  applicantUid,
  currentStatus,
}: KycSupportModalProps) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || message.length < 10) {
      setError("Please describe your question in at least 10 characters.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch("/api/public/v1/support/tickets", {
        method: "POST",
        headers,
        body: JSON.stringify({
          category: "verification",
          kycCaseRef: applicantUid ? `KYC-${applicantUid.slice(0, 12)}` : undefined,
          message: message.trim(),
          metadata: {
            currentKycStatus: currentStatus || "unknown",
            clientTimestamp: new Date().toISOString(),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit support inquiry.");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-white/20 bg-[#09153a] p-6 text-white shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-3">
          <HelpCircle className="h-5 w-5 text-cyan-400" />
          <h3 className="text-base font-bold">Ask About My Verification</h3>
        </div>

        {submitted ? (
          <div className="space-y-4 text-center py-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-white">Inquiry Received</h4>
            <p className="text-xs text-slate-300">
              Your message has been linked to your verification case. Our compliance support team will reply directly to your registered email address.
            </p>
            <button
              onClick={onClose}
              className="rounded-xl bg-cyan-500 px-5 py-2 text-xs font-bold text-[#031039] hover:bg-cyan-400 transition"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-slate-300">
              Have questions about document requirements, review times, or a requested change? Send a message directly to compliance support.
            </p>

            {applicantUid && (
              <div className="text-[11px] text-slate-400 bg-white/5 p-2 rounded-lg border border-white/5">
                Case Reference: <span className="font-mono text-cyan-300">KYC-{applicantUid.slice(0, 12)}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1">
                Your Question or Description:
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your inquiry (e.g. question about document format, name spelling, or status update)..."
                rows={4}
                className="w-full rounded-xl border border-white/10 bg-[#040d27] p-3 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/30">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !message.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-cyan-500 px-5 py-2 text-xs font-bold text-[#031039] hover:bg-cyan-400 disabled:opacity-50 transition"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{isSubmitting ? "Sending..." : "Submit Inquiry"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
