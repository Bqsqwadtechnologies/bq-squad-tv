import { useEffect, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";

type Page = { slug: string; title: string; body: string; version: number; effectiveAt?: string | null };
function renderLine(line: string, key: number) {
  const text = line.replace(/\r/g, "");
  if (!text.trim()) return <div key={key} className="h-2" />;
  const heading = /^(#{1,3})\s+(.+)$/.exec(text);
  if (heading) {
    const Tag = heading[1]!.length === 1 ? "h1" : heading[1]!.length === 2 ? "h2" : "h3";
    return <Tag key={key} className="mb-3 mt-7 text-xl font-bold text-foreground">{heading[2]}</Tag>;
  }
  if (text.startsWith("- ")) return <li key={key} className="ml-5 list-disc text-sm leading-7 text-foreground/85">{text.slice(2)}</li>;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <p key={key} className="text-sm leading-7 text-foreground/85">{parts.map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</p>;
}
function LegalPage() {
  const { slug } = useParams({ from: "/legal/$slug" });
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/public/v1/pages/" + encodeURIComponent(slug), { cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "This page is not available yet."); return data as Page; })
      .then(data => { if (active) setPage(data); })
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : "This page is not available yet."); });
    return () => { active = false; };
  }, [slug]);
  return <main className="mx-auto min-h-screen max-w-4xl px-5 py-10 sm:px-8">
    <header className="mb-8 flex items-center justify-between gap-4 border-b border-border pb-5">
      <Link to="/" className="font-black text-primary">BQ SQWAD TV</Link>
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Back to home</Link>
    </header>
    {page ? <><h1 className="mb-2 text-3xl font-black">{page.title}</h1><p className="mb-7 text-xs text-muted-foreground">Version {page.version}{page.effectiveAt ? " · Effective " + page.effectiveAt : ""}</p><article className="space-y-1">{page.body.split("\n").map(renderLine)}</article></> : <section role={error ? "alert" : "status"} className="rounded-2xl border border-border bg-card p-6"><h1 className="text-xl font-bold">{error ? "Page not available" : "Loading page…"}</h1><p className="mt-2 text-sm text-muted-foreground">{error || "We are retrieving the latest published version."}</p></section>}
    <footer className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
      <Link to="/legal/privacy-policy">Privacy Policy</Link><Link to="/legal/terms">Terms</Link><Link to="/legal/privacy-policy">Cookie notice</Link><a href="mailto:tv@bqsqwad.com">Contact</a>
    </footer>
  </main>;
}
export const Route = createFileRoute("/legal/$slug")({
  component: LegalPage,
  head: () => ({ meta: [{ title: "Legal information | BQ SQWAD TV" }, { name: "robots", content: "index, follow" }] }),
});
