import React, { useState } from "react";
import { HelpCircle, Info, X } from "lucide-react";
import { getKycString } from "@/lib/kyc-strings";

export interface KycFieldHelpProps {
  helpKey: string;
  customStrings?: Record<string, string>;
  title?: string;
  className?: string;
}

export function KycFieldHelp({
  helpKey,
  customStrings,
  title = "Help & Information",
  className = "",
}: KycFieldHelpProps) {
  const [open, setOpen] = useState(false);
  const helpText = getKycString(helpKey, customStrings);

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={`Show help for ${title}`}
        aria-expanded={open}
        className="ms-1.5 inline-flex items-center text-slate-400 hover:text-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 rounded-full transition"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="region"
          aria-live="polite"
          className="absolute z-40 start-0 top-6 w-72 rounded-xl border border-cyan-500/30 bg-[#09153a] p-3 text-xs text-slate-200 shadow-xl backdrop-blur-md"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5 mb-2">
            <span className="flex items-center gap-1 font-bold text-cyan-300">
              <Info className="h-3.5 w-3.5" />
              <span>{title}</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="leading-relaxed text-[11px] text-slate-300">{helpText}</p>
        </div>
      )}
    </div>
  );
}
