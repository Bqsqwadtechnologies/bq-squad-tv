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
  head: () => ({
    meta: [
      { title: "Notifications | BQ SQWAD TV" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function NotificationsPage() {
  const [token, setToken] = useState("");
  const [items, setItems] = useState<Notice[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"inbox" | "preferences">("inbox");
  const [prefs, setPrefs] = useState({
    emailWatchlist: true,
    pushLiveBroadcasts: true,
    watchPartyInvites: true,
    billingReceipts: true,
    marketingUpdates: false,
  });
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [prefsBusy, setPrefsBusy] = useState(false);


  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const idToken = await restoreWebSession();
        if (!idToken) {
          if (active) setBusy(false);
          return;
        }
        const response = await fetch("/api/public/v1/notifications", {
          headers: await getWebAuthHeaders(idToken),
          cache: "no-store",
        });
        const data = (await response.json()) as Notice[] | { error?: string };
        if (!response.ok || !Array.isArray(data))
          throw new Error(
            !Array.isArray(data)
              ? (data.error ?? "Notifications are unavailable.")
              : "Notifications are unavailable.",
          );
        if (active) {
          setToken(idToken);
          setItems(data);
        }

        // Load preferences
        fetch("/api/public/v1/user/notification-preferences", {
          headers: await getWebAuthHeaders(idToken),
          cache: "no-store",
        })
          .then((r) => r.json())
          .then((data) => {
            if (data && typeof data.emailWatchlist === "boolean") {
              setPrefs(data);
            }
          })
          .catch(() => {});

      } catch (caught) {
        if (active)
          setError(caught instanceof Error ? caught.message : "Notifications are unavailable.");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function markRead(item: Notice) {
    if (!token || item.read) return;
    try {
      const response = await fetch(
        "/api/public/v1/notifications/" + encodeURIComponent(item.id) + "/read",
        {
          method: "POST",
          headers: await getWebAuthHeaders(token),
          cache: "no-store",
        },
      );
      if (!response.ok) throw new Error("Could not update this notification.");
      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, read: true } : row)),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this notification.");
    }
  }


  async function savePreferences(newPrefs: typeof prefs) {
    if (!token) return;
    setPrefs(newPrefs);
    setPrefsBusy(true);
    try {
      await fetch("/api/public/v1/user/notification-preferences", {
        method: "POST",
        headers: await getWebAuthHeaders(token),
        body: JSON.stringify(newPrefs),
      });
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setPrefsBusy(false);
    }
  }

  async function openNotice(item: Notice) {
    await markRead(item);
    const destination = item.deepLink;
    if (destination && destination.startsWith("/") && !destination.startsWith("//"))
      window.location.assign(destination);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-3xl">
        <a
          href="/account"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary"
        >
          <ArrowLeft size={17} /> Account
        </a>
        <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Bell size={22} />
            </span>
            <div>
              <h1 className="text-2xl font-black">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                Updates about your account and viewing activity.
              </p>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="mt-6 flex gap-2 border-b border-border pb-3">
            <button
              type="button"
              onClick={() => setActiveTab("inbox")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "inbox" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bell size={14} />
              <span>Notifications Inbox</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("preferences")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "preferences" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sliders size={14} />
              <span>Preferences</span>
            </button>
          </div>

          {activeTab === "preferences" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-border bg-background p-4 sm:p-6 space-y-4">
                <h2 className="text-base font-bold">Manage Notification Channels</h2>
                <p className="text-xs text-muted-foreground">
                  Select which updates you want to receive via in-app push and email.
                </p>

                <div className="space-y-3 divide-y divide-border pt-2">
                  {[
                    { key: "emailWatchlist", title: "Watchlist Releases & Reminders", desc: "Get notified when new episodes of your saved titles premiere." },
                    { key: "pushLiveBroadcasts", title: "Live Streams & Events", desc: "Alerts when channels or creators you follow start broadcasting live." },
                    { key: "watchPartyInvites", title: "Watch Party Invitations", desc: "Invitations to join synced rooms from friends." },
                    { key: "billingReceipts", title: "Billing & Settlement Receipts", desc: "Receipts for top-ups, watch billing statements, and payouts." },
                    { key: "marketingUpdates", title: "Promotions & Featured Releases", desc: "Weekly digests and exclusive bundle discounts." },
                  ].map((pref) => {
                    const enabled = prefs[pref.key as keyof typeof prefs];
                    return (
                      <div key={pref.key} className="flex items-center justify-between pt-3 gap-4">
                        <div>
                          <p className="text-sm font-semibold">{pref.title}</p>
                          <p className="text-xs text-muted-foreground">{pref.desc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => savePreferences({ ...prefs, [pref.key]: !enabled })}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            enabled ? "bg-primary" : "bg-muted"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block size-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                              enabled ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {prefsSaved && (
                  <p className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold pt-2">
                    <Check size={14} /> Preferences updated successfully!
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>

          {busy ? (
            <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="animate-spin" size={18} /> Loading notifications…
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"
            >
              {error}
            </p>
          ) : null}
          {!busy && !token ? (
            <p className="mt-6 rounded-xl bg-muted p-4 text-sm">
              Sign in to view your notifications.{" "}
              <a href="/account" className="font-bold text-primary underline">
                Sign in
              </a>
              .
            </p>
          ) : null}
          {!busy && token && items.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
              <CheckCheck className="mx-auto text-primary" size={30} />
              <h2 className="mt-3 font-bold">All caught up</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                New account updates will appear here.
              </p>
            </div>
          ) : null}
          <div className="mt-6 grid gap-3">
            {items.map((item) => (
              <article
                key={item.id}
                className={
                  "rounded-2xl border p-4 " +
                  (item.read ? "border-border bg-background" : "border-primary/30 bg-primary/5")
                }
              >
                <button
                  type="button"
                  onClick={() => void openNotice(item)}
                  className="block min-h-11 w-full text-left"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-bold">{item.title}</span>
                    {!item.read ? (
                      <span
                        className="mt-1 size-2 shrink-0 rounded-full bg-primary"
                        aria-label="Unread"
                      />
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                    {item.body}
                  </span>
                  {item.createdAt ? (
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  ) : null}
                </button>
                {!item.read ? (
                  <button
                    type="button"
                    onClick={() => void markRead(item)}
                    className="mt-2 min-h-10 text-xs font-bold text-primary underline"
                  >
                    Mark as read
                  </button>
                ) : null}
              </article>
            ))}
          </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
