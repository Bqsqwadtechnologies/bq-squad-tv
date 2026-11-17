import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Bell, CheckCheck, LoaderCircle } from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

type Notice = {
  id: string;
  title: string;
  body: string;
  deepLink: string | null;
  read: boolean;
  deliveryStatus: string;
  createdAt: string | null;
};

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
  head: () => ({ meta: [
    { title: "Notifications | BQ SQWAD TV" },
    { name: "robots", content: "noindex, nofollow, noarchive" },
  ] }),
});

function NotificationsPage() {
  const [token, setToken] = useState("");
  const [items, setItems] = useState<Notice[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const idToken = await restoreWebSession();
        if (!idToken) { if (active) setBusy(false); return; }
        const response = await fetch("/api/public/v1/notifications", {
          headers: await getWebAuthHeaders(idToken), cache: "no-store",
        });
        const data = await response.json() as Notice[] | { error?: string };
        if (!response.ok || !Array.isArray(data)) throw new Error(!Array.isArray(data) ? data.error ?? "Notifications are unavailable." : "Notifications are unavailable.");
        if (active) { setToken(idToken); setItems(data); }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Notifications are unavailable.");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function markRead(item: Notice) {
    if (!token || item.read) return;
    try {
      const response = await fetch("/api/public/v1/notifications/" + encodeURIComponent(item.id) + "/read", {
        method: "POST", headers: await getWebAuthHeaders(token), cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not update this notification.");
      setItems(current => current.map(row => row.id === item.id ? { ...row, read: true } : row));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this notification.");
    }
  }

  async function openNotice(item: Notice) {
    await markRead(item);
    const destination = item.deepLink;
    if (destination && destination.startsWith("/") && !destination.startsWith("//")) window.location.assign(destination);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-3xl">
        <a href="/account" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary"><ArrowLeft size={17} /> Account</a>
        <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Bell size={22} /></span><div><h1 className="text-2xl font-black">Notifications</h1><p className="text-sm text-muted-foreground">Updates about your account and viewing activity.</p></div></div>
          {busy ? <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" size={18} /> Loading notifications…</p> : null}
          {error ? <p role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">{error}</p> : null}
          {!busy && !token ? <p className="mt-6 rounded-xl bg-muted p-4 text-sm">Sign in to view your notifications. <a href="/account" className="font-bold text-primary underline">Sign in</a>.</p> : null}
          {!busy && token && items.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center"><CheckCheck className="mx-auto text-primary" size={30} /><h2 className="mt-3 font-bold">All caught up</h2><p className="mt-1 text-sm text-muted-foreground">New account updates will appear here.</p></div> : null}
          <div className="mt-6 grid gap-3">
            {items.map(item => (
              <article key={item.id} className={"rounded-2xl border p-4 " + (item.read ? "border-border bg-background" : "border-primary/30 bg-primary/5")}>
                <button type="button" onClick={() => void openNotice(item)} className="block min-h-11 w-full text-left">
                  <span className="flex items-start justify-between gap-3"><span className="font-bold">{item.title}</span>{!item.read ? <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">{item.body}</span>
                  {item.createdAt ? <span className="mt-2 block text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span> : null}
                </button>
                {!item.read ? <button type="button" onClick={() => void markRead(item)} className="mt-2 min-h-10 text-xs font-bold text-primary underline">Mark as read</button> : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
