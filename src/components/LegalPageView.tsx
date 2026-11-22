import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

type Page = {
  slug: string;
  title: string;
  body: string;
  version: number;
  effectiveAt?: string | null;
  status?: "draft" | "scheduled" | "published";
  published?: boolean;
};

function renderLine(line: string, key: number) {
  const text = line.replace(/\r/g, "");
  if (!text.trim()) return <div key={key} className="h-2" />;
  const heading = /^(#{1,3})\s+(.+)$/.exec(text);
  if (heading) {
    const level = heading[1]?.length;
    const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
    return (
      <Tag key={key} className="mb-3 mt-7 text-xl font-bold text-foreground">
        {heading[2]}
      </Tag>
    );
  }
  if (text.startsWith("- "))
    return (
      <li key={key} className="ml-5 list-disc text-sm leading-7 text-foreground/85">
        {text.slice(2)}
      </li>
    );
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p key={key} className="text-sm leading-7 text-foreground/85">
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      )}
    </p>
  );
}

export function LegalPageView({ slug }: { slug: string }) {
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch("/api/public/v1/pages/" + encodeURIComponent(slug), { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.error || "This document could not be retrieved.");
        return data as Page;
      })
      .then((data) => {
        if (active) {
          setPage(data);
          setLoading(false);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "This document could not be retrieved.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [slug, retryCount]);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-10 sm:px-8 bg-background text-foreground">
      <header className="mb-8 flex items-center justify-between gap-4 border-b border-border pb-5">
        <Link to="/" className="font-black text-primary">
          BQ SQWAD TV
        </Link>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          Back to home
        </Link>
      </header>

      {page ? (
        <>
          <h1 className="mb-2 text-3xl font-black">{page.title}</h1>
          {page.published === true && page.status === "published" ? (
            <p className="mb-7 text-xs text-muted-foreground">
              Version {page.version}
              {page.effectiveAt ? " · Effective " + new Date(page.effectiveAt).toLocaleDateString() : ""}
            </p>
          ) : (
            <div className="mb-7 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm font-bold text-amber-700 dark:text-amber-300">Draft — not yet effective</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                This document is available for review but has not been formally published. It does not replace an effective policy or agreement.
              </p>
            </div>
          )}
          <article className="space-y-1">{page.body.split("\n").map(renderLine)}</article>
        </>
      ) : loading ? (
        <section
          role="status"
          className="rounded-2xl border border-border bg-card p-12 text-center"
        >
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <h1 className="mt-4 text-lg font-bold">Retrieving document…</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Loading the latest published terms and policies.
          </p>
        </section>
      ) : (
        <section
          role="alert"
          className="rounded-2xl border border-destructive/20 bg-card p-8 text-center"
        >
          <h1 className="text-xl font-bold">Unable to load document</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error || "We could not retrieve this document at this moment."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setRetryCount((c) => c + 1)}
              className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 transition"
            >
              Try again
            </button>
            <a
              href="mailto:tv@bqsqwad.com"
              className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold hover:bg-muted transition"
            >
              Contact support
            </a>
          </div>
        </section>
      )}

      <footer className="mt-12 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
        <a href="/privacy" className="hover:text-foreground">
          Privacy Policy
        </a>
        <a href="/terms" className="hover:text-foreground">
          Terms
        </a>
        <a href="/producer-privacy" className="hover:text-foreground">
          Producer Privacy
        </a>
        <a href="/producer-terms" className="hover:text-foreground">
          Producer Terms
        </a>
        <a href="/legal/provider-privacy" className="hover:text-foreground">
          Provider Privacy
        </a>
        <a href="/legal/provider-terms" className="hover:text-foreground">
          Provider Terms
        </a>
        <a href="/legal/cookie" className="hover:text-foreground">
          Cookie notice
        </a>
        <a href="/producer" className="hover:text-foreground">
          Producer Console
        </a>
        <a href="mailto:tv@bqsqwad.com" className="hover:text-foreground">
          Contact
        </a>
      </footer>
    </main>
  );
}
