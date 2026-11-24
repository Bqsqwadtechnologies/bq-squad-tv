import React from "react";
import { ArrowLeft } from "lucide-react";

export interface BackButtonProps {
  to?: string;
  label?: string;
  className?: string;
}

export function BackButton({ to, label = "Back", className = "" }: BackButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (!to) {
      e.preventDefault();
      if (typeof window !== "undefined" && window.history.length > 1) {
        window.history.back();
      } else if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }
  };

  if (to) {
    return (
      <a
        href={to}
        className={`inline-flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition shadow-sm ${className}`}
        aria-label={label}
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition shadow-sm ${className}`}
      aria-label={label}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
}
