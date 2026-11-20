import React from "react";
import { Info, ExternalLink } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import tipsData from "../../content/help/tips.json";

export interface InfoTipProps {
  featureId: string;
  scope?: "provider" | "producer" | "viewer";
  className?: string;
}

export function InfoTip({
  featureId,
  scope = "provider",
  className = "",
}: InfoTipProps) {
  const tip = (tipsData as Record<string, {
    title: string;
    description: string;
    example?: string;
    docsSlug: string;
    anchor: string;
  }>)[featureId];

  if (!tip) {
    return null;
  }

  const docsHref = `/${scope}/docs#${tip.anchor}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Help information for ${tip.title}`}
          className={`inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-full focus:outline-none focus:ring-1 focus:ring-primary ${className}`}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 text-xs shadow-xl border border-border/80 bg-background/95 backdrop-blur-sm z-50">
        <div className="space-y-1.5">
          <div className="font-semibold text-foreground text-sm flex items-center justify-between">
            <span>{tip.title}</span>
          </div>
          <p className="text-muted-foreground leading-relaxed">{tip.description}</p>
          {tip.example && (
            <div className="bg-muted/40 rounded px-2 py-1 text-[11px] text-muted-foreground/90 font-mono border border-border/40">
              {tip.example}
            </div>
          )}
          <div className="pt-1.5 border-t border-border/40 flex justify-end">
            <a
              href={docsHref}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <span>Learn more</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
