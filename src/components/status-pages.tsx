import type { ReactNode } from "react";

export function StatusPage({
  eyebrow = "BQ SQWAD TV",
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
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-7 text-center shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h1 className="mt-4 text-3xl font-black tracking-tight">{title}</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">{message}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <a href={actionHref} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            {actionLabel}
          </a>
          {secondaryHref && secondaryLabel ? (
            <a href={secondaryHref} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
              {secondaryLabel}
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export function PolicyPublicationNotice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="min-h-screen bg-background px-5 py-12 text-foreground">
      <article className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-6 sm:p-10">
        <a href="/" className="text-sm font-semibold text-primary">BQ SQWAD TV</a>
        <h1 className="mt-6 text-3xl font-black">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
        <div className="mt-8 rounded-2xl border border-border bg-muted p-5">
          <p className="font-semibold">Publication pending</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This document is not yet an approved policy and should not be treated as the final terms. We will publish the approved version after the company has completed its review.
          </p>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Questions? Contact <a className="font-semibold text-primary underline underline-offset-4" href="mailto:tv@bqsqwad.com">tv@bqsqwad.com</a>.
        </p>
      </article>
    </main>
  );
}
