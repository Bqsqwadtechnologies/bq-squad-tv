import React from "react";
import { BrandLogo } from "./BrandLogo";

export function BrandSplash() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-[#030B2A] via-[#07143D] to-[#0A1A4A] text-white">
      <div className="flex flex-col items-center space-y-6 text-center animate-fade-in">
        <BrandLogo
          variant="splash"
          className="h-28 w-28 drop-shadow-[0_0_25px_rgba(0,216,245,0.5)]"
        />
        <div className="space-y-2">
          <p className="text-xs font-bold tracking-[0.25em] text-[#00D8F5] uppercase">
            WATCH • STREAM • ENJOY
          </p>
          <div className="pt-4 flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#00D8F5]/30 border-t-[#00D8F5]" />
          </div>
          <p className="pt-4 text-xs font-medium text-slate-300 tracking-wider">
            Entertainment Without Limits
          </p>
        </div>
      </div>
    </div>
  );
}
