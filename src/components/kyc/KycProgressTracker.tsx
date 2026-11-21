import React, { useState } from "react";
import { ShieldCheck, Save, Smartphone, QrCode, Wifi, HelpCircle, Check, X, Copy } from "lucide-react";
import { getKycString } from "@/lib/kyc-strings";

export interface KycProgressTrackerProps {
  currentStep: number; // 1 to 5
  totalSteps?: number;
  onSaveDraft?: () => Promise<void>;
  isSavingDraft?: boolean;
  lastSavedAt?: string | null;
  lowBandwidthEnabled: boolean;
  onToggleLowBandwidth: (enabled: boolean) => void;
  onOpenSupport?: () => void;
  onRequestHandoff?: () => Promise<{ resumeUrl: string; token: string }>;
  customStrings?: Record<string, string>;
}

export function KycProgressTracker({
  currentStep,
  totalSteps = 5,
  onSaveDraft,
  isSavingDraft = false,
  lastSavedAt,
  lowBandwidthEnabled,
  onToggleLowBandwidth,
  onOpenSupport,
  onRequestHandoff,
  customStrings,
}: KycProgressTrackerProps) {
  const [showQrModal, setShowQrModal] = useState(false);
  const [handoffData, setHandoffData] = useState<{ resumeUrl: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loadingHandoff, setLoadingHandoff] = useState(false);

  const steps = [
    { num: 1, label: getKycString("kyc.step.country", customStrings) },
    { num: 2, label: getKycString("kyc.step.phone", customStrings) },
    { num: 3, label: getKycString("kyc.step.details", customStrings) },
    { num: 4, label: getKycString("kyc.step.documents", customStrings) },
    { num: 5, label: getKycString("kyc.step.review", customStrings) },
  ];

  const handleOpenHandoff = async () => {
    if (!onRequestHandoff) return;
    setLoadingHandoff(true);
    try {
      const data = await onRequestHandoff();
      setHandoffData(data);
      setShowQrModal(true);
    } catch {
      // ignore
    } finally {
      setLoadingHandoff(false);
    }
  };

  const copyToClipboard = () => {
    if (!handoffData?.resumeUrl) return;
    navigator.clipboard.writeText(handoffData.resumeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-[#061234] p-4 text-white">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
          <span className="font-semibold text-slate-300">
            {getKycString("kyc.header.title", customStrings)}
          </span>
          <span className="rounded-full bg-cyan-950 px-2 py-0.5 text-[10px] font-bold text-cyan-400 border border-cyan-800">
            Step {currentStep} of {totalSteps}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Low Bandwidth Toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/10 transition">
            <Wifi className={`h-3 w-3 ${lowBandwidthEnabled ? "text-emerald-400" : "text-slate-500"}`} />
            <span>Low-Bandwidth Mode</span>
            <input
              type="checkbox"
              checked={lowBandwidthEnabled}
              onChange={(e) => onToggleLowBandwidth(e.target.checked)}
              className="size-3 accent-cyan-400 ms-1"
            />
          </label>

          {/* Save Draft Button */}
          {onSaveDraft && (
            <button
              type="button"
              onClick={() => void onSaveDraft()}
              disabled={isSavingDraft}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/10 transition disabled:opacity-50"
            >
              <Save className="h-3 w-3 text-cyan-400" />
              <span>{isSavingDraft ? "Saving..." : getKycString("kyc.draft.saveDraft", customStrings)}</span>
            </button>
          )}

          {/* Resume on Mobile Button */}
          {onRequestHandoff && (
            <button
              type="button"
              onClick={() => void handleOpenHandoff()}
              disabled={loadingHandoff}
              className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-300 hover:bg-cyan-500/20 transition"
            >
              <Smartphone className="h-3 w-3" />
              <span>Continue on Phone</span>
            </button>
          )}

          {/* Ask Support Button */}
          {onOpenSupport && (
            <button
              type="button"
              onClick={onOpenSupport}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/10 transition"
            >
              <HelpCircle className="h-3 w-3 text-amber-400" />
              <span>Ask Support</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar (Accessible) */}
      <div
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-label={getKycString("kyc.aria.progressBar", customStrings)}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
      >
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>

      {/* Steps List */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[11px]">
        {steps.map((st) => {
          const isDone = st.num < currentStep;
          const isCurrent = st.num === currentStep;
          return (
            <div
              key={st.num}
              className={`flex flex-col items-center justify-center p-2 rounded-xl border transition ${
                isCurrent
                  ? "border-cyan-400 bg-cyan-950/40 text-cyan-300 font-bold"
                  : isDone
                  ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-300 font-medium"
                  : "border-white/5 bg-white/[0.02] text-slate-500"
              }`}
            >
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] mb-1 ${
                  isCurrent
                    ? "bg-cyan-500 text-black font-extrabold"
                    : isDone
                    ? "bg-emerald-500 text-black font-extrabold"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : st.num}
              </div>
              <span className="truncate max-w-[100px]">{st.label.replace(/^\d+\.\s*/, "")}</span>
            </div>
          );
        })}
      </div>

      {lastSavedAt && (
        <div className="text-[11px] text-slate-400 text-right">
          Last saved: {new Date(lastSavedAt).toLocaleTimeString()}
        </div>
      )}

      {/* QR Handoff Modal */}
      {showQrModal && handoffData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-white/20 bg-[#09153a] p-6 text-white shadow-2xl">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400">
                <QrCode className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold">Resume Verification on Mobile</h3>
              <p className="text-xs text-slate-300">
                Point your smartphone camera at the code below to easily capture identity documents or take a selfie. All entered data carries over automatically.
              </p>

              {/* QR Code Placeholder Rendering via SVG */}
              <div className="mx-auto my-4 flex h-48 w-48 items-center justify-center rounded-xl bg-white p-3 text-black">
                <div className="flex flex-col items-center justify-center text-center">
                  <QrCode className="h-32 w-32 text-slate-900" />
                  <span className="text-[10px] font-mono text-slate-600">Scan with Phone Camera</span>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-500 py-2.5 text-xs font-bold text-[#031039] hover:bg-cyan-400 transition"
                >
                  <Copy className="h-4 w-4" />
                  <span>{copied ? "Link Copied!" : "Copy Mobile Resume Link"}</span>
                </button>
                <p className="text-[10px] text-slate-400">
                  This mobile link is cryptographically signed and expires in 15 minutes for your security.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
