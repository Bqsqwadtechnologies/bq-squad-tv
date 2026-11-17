import type { ReactNode } from "react";
import { Star, UserRound } from "lucide-react";

type Action = { label: string; onClick: () => void };

export function AppCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-card p-4 text-card-foreground ${className}`}>{children}</section>;
}

export function Avatar({ name, size = 44 }: { name?: string | null; size?: number }) {
  const initial = name?.trim().charAt(0).toLocaleUpperCase();
  return <span aria-label={name ? `Profile: ${name}` : "Profile"} role="img" className="inline-grid shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary" style={{ width: size, height: size }}>
    {initial || <UserRound size={Math.max(18, Math.round(size * 0.48))} aria-hidden="true" />}
  </span>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: Action }) {
  return <div className="grid justify-items-center gap-2 px-5 py-10 text-center">
    <h2 className="text-base font-semibold">{title}</h2>
    {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
    {action ? <button type="button" onClick={action.onClick} className="mt-2 min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{action.label}</button> : null}
  </div>;
}

export function ErrorState({ message = "We could not load this. Try again.", onRetry }: { message?: string; onRetry: () => void }) {
  return <div role="alert" className="grid gap-3 rounded-xl border border-destructive/30 bg-card p-4">
    <p className="text-sm text-card-foreground">{message}</p>
    <button type="button" onClick={onRetry} className="min-h-11 w-fit rounded-lg border border-border px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">Retry</button>
  </div>;
}

export function Skeleton({ className = "h-5 w-full" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-md bg-muted ${className}`} />;
}

export function ListRow({ title, detail, trailing }: { title: string; detail?: string; trailing?: ReactNode }) {
  return <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border py-3">
    <div className="min-w-0"><p className="truncate text-sm font-medium">{title}</p>{detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}</div>
    {trailing}
  </div>;
}

export function PriceChip({ amount, currency }: { amount: number; currency: string }) {
  const formatted = new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  return <span className="inline-flex min-h-8 items-center rounded-full border border-primary/25 bg-primary/10 px-3 text-xs font-semibold text-foreground">{formatted}</span>;
}

export function RatingStars({ rating, label }: { rating: number; label?: string }) {
  const safeRating = Math.max(0, Math.min(5, rating));
  return <span className="inline-flex items-center gap-1" aria-label={label ?? `Rated ${safeRating.toFixed(1)} out of 5`}>
    <Star size={15} className="fill-current text-amber-500" aria-hidden="true" />
    <span className="text-sm tabular-nums">{safeRating.toFixed(1)}</span>
  </span>;
}

export function SegmentedControl<T extends string>({ value, options, onChange, label }: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string;
}) {
  return <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted p-1">
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}
      className={`min-h-11 rounded-lg px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${value === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
      {option.label}
    </button>)}
  </div>;
}
