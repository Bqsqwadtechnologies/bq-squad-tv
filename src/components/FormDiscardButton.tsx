import React from "react";
import { RotateCcw } from "lucide-react";

export interface FormDiscardButtonProps {
  onDiscard?: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function FormDiscardButton({
  onDiscard,
  label = "Discard",
  disabled = false,
  className = "",
}: FormDiscardButtonProps) {
  const handleDiscard = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (onDiscard) {
      onDiscard();
    } else {
      // If inside a form, reset it or go back
      const form = (e.currentTarget as HTMLElement).closest("form");
      if (form) {
        form.reset();
      } else if (typeof window !== "undefined" && window.history.length > 1) {
        window.history.back();
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleDiscard}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition disabled:opacity-40 disabled:pointer-events-none ${className}`}
      aria-label={label}
    >
      <RotateCcw className="h-3.5 w-3.5 opacity-70" />
      <span>{label}</span>
    </button>
  );
}
