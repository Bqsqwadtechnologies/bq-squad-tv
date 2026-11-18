import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";

export function StatusPage({
  eyebrow,
  title,
  message,
  actionHref = "/",
  actionLabel = "Go home",
  secondaryHref,
  secondaryLabel,
}: {
  eyebrow?: string;
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-background px-5 py-16 text-foreground">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-7 text-center shadow-lg sm:p-10 flex flex-col items-center">
        <BrandLogo variant="icon" className="mb-4 h-12 w-12" />
        {eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 text-3xl font-black tracking-tight">{title}</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">{message}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3 w-full">
          <a
            href={actionHref}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {actionLabel}
          </a>
          {secondaryHref && secondaryLabel ? (
            <a
              href={secondaryHref}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {secondaryLabel}
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}
