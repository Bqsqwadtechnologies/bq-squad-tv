import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import {
  Bell,
  ChevronRight,
  Lock,
  LogOut,
  Moon,
  Shield,
  Sparkles,
  Sliders,
  Sun,
  Laptop,
  Wifi,
  Check,
} from "lucide-react";
import { getWebAccount, restoreWebSession, getWebAuthHeaders, signOutWeb } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings — BQ SQWAD TV" },
      {
        name: "description",
        content: "Manage playback quality, notifications, security, themes, and preferences.",
      },
    ],
  }),
});

type ThemeChoice = "system" | "light" | "dark";

function SettingsPage() {
  const [themePreference, setThemePreference] = useState<ThemeChoice>("system");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [playbackQuality, setPlaybackQuality] = useState("Auto");
  const [wifiOnly, setWifiOnly] = useState(false);
  const [parentalControlsActive, setParentalControlsActive] = useState(false);
  const [kidsModeActive, setKidsModeActive] = useState(false);
  const [isUnder18, setIsUnder18] = useState(false);
  const [parentalPin, setParentalPin] = useState("");
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("bq-sqwad-theme") as ThemeChoice | null;
      if (savedTheme === "system" || savedTheme === "light" || savedTheme === "dark") {
        setThemePreference(savedTheme);
      }

      const savedNotifs = localStorage.getItem("bq-sqwad-notifs");
      if (savedNotifs !== null) setNotificationsEnabled(savedNotifs === "true");

      const savedQuality = localStorage.getItem("bq-sqwad-quality");
      if (savedQuality) setPlaybackQuality(savedQuality);

      const savedWifi = localStorage.getItem("bq-sqwad-wifi-only");
      if (savedWifi !== null) setWifiOnly(savedWifi === "true");

      const savedParental = localStorage.getItem("bq-sqwad-parental");
      if (savedParental !== null) setParentalControlsActive(savedParental === "true");

      const savedKids = localStorage.getItem("bq-sqwad-kids-mode");
      if (savedKids !== null) setKidsModeActive(savedKids === "true");
    } catch (_err) {
      void _err;
    }

    // Check profile for under-18 status
    void (async () => {
      try {
        const token = await restoreWebSession();
        if (!token) return;
        const headers = await getWebAuthHeaders(token);
        const res = await fetch("/api/public/v1/profile", { headers, cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.isUnder18 || data.kidsModeLocked) {
            setIsUnder18(true);
            setKidsModeActive(true);
          }
        }
      } catch {}
    })();
  }, []);

  function triggerSaveToast() {
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  }

  function changeTheme(theme: ThemeChoice) {
    setThemePreference(theme);
    try {
      localStorage.setItem("bq-sqwad-theme", theme);
    } catch {}

    const root = document.documentElement;
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
      root.classList.toggle("light", !prefersDark);
    } else if (theme === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
    }

    triggerSaveToast();

    void (async () => {
      try {
        const token = await restoreWebSession();
        if (!token) return;
        const headers = await getWebAuthHeaders(token);
        await fetch("/api/public/v1/profile", {
          method: "PATCH",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ preferredTheme: theme }),
        });
      } catch {}
    })();
  }

  function toggleNotifications() {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    localStorage.setItem("bq-sqwad-notifs", String(next));
    triggerSaveToast();
  }

  function changeQuality(q: string) {
    setPlaybackQuality(q);
    localStorage.setItem("bq-sqwad-quality", q);
    triggerSaveToast();
  }

  function toggleWifiOnly() {
    const next = !wifiOnly;
    setWifiOnly(next);
    localStorage.setItem("bq-sqwad-wifi-only", String(next));
    triggerSaveToast();
  }

  function toggleKidsMode() {
    if (isUnder18) return; // Cannot disable if account holder is minor
    const next = !kidsModeActive;
    setKidsModeActive(next);
    localStorage.setItem("bq-sqwad-kids-mode", String(next));
    triggerSaveToast();
  }

  function handleParentalPinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parentalPin.length === 4) {
      const next = !parentalControlsActive;
      setParentalControlsActive(next);
      localStorage.setItem("bq-sqwad-parental", String(next));
      if (!next && !isUnder18) {
        setKidsModeActive(false);
        localStorage.setItem("bq-sqwad-kids-mode", "false");
      }
      setPinPromptOpen(false);
      setParentalPin("");
      triggerSaveToast();
    }
  }

  async function handleLogout() {
    try {
      await signOutWeb();
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between pb-6 border-b border-border">
          <Link to="/" aria-label="BQ SQWAD TV home">
            <BrandLogo variant="horizontal" className="h-8 w-auto" />
          </Link>
          <Link to="/account" className="text-sm font-semibold text-primary hover:underline">
            Back to Account
          </Link>
        </header>

        <div className="mt-8 flex items-center justify-between">
          <h1 className="text-2xl font-black">Settings</h1>
          {saveToast ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1 text-xs font-bold text-primary">
              <Check size={14} /> Saved
            </span>
          ) : null}
        </div>

        {/* Group 1: Appearance & Theme */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
            Appearance & Theme
          </h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => changeTheme("system")}
              className={`flex items-center gap-3 p-3.5 rounded-xl border transition text-left ${
                themePreference === "system"
                  ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                  : "border-border bg-muted/40 hover:bg-muted text-muted-foreground"
              }`}
            >
              <Laptop size={18} />
              <div>
                <p className="text-sm">System Default</p>
                <p className="text-xs opacity-75">Auto day/night</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => changeTheme("light")}
              className={`flex items-center gap-3 p-3.5 rounded-xl border transition text-left ${
                themePreference === "light"
                  ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                  : "border-border bg-muted/40 hover:bg-muted text-muted-foreground"
              }`}
            >
              <Sun size={18} />
              <div>
                <p className="text-sm">Clean Daylight</p>
                <p className="text-xs opacity-75">Crisp white mode</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => changeTheme("dark")}
              className={`flex items-center gap-3 p-3.5 rounded-xl border transition text-left ${
                themePreference === "dark"
                  ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                  : "border-border bg-muted/40 hover:bg-muted text-muted-foreground"
              }`}
            >
              <Moon size={18} />
              <div>
                <p className="text-sm">Night Cinema</p>
                <p className="text-xs opacity-75">Dark Navy mode</p>
              </div>
            </button>
          </div>
        </section>

        {/* Group 2: Preferences & Playback */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
            Playback & Network
          </h2>
          <div className="mt-4 divide-y divide-border">
            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <Sliders size={20} className="text-primary" />
                <div>
                  <p className="text-sm font-semibold">Playback Quality</p>
                  <p className="text-xs text-muted-foreground">Stream resolution adaptation</p>
                </div>
              </div>
              <select
                value={playbackQuality}
                onChange={(e) => changeQuality(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground"
              >
                <option value="Auto">Auto</option>
                <option value="1080p">1080p (FHD)</option>
                <option value="720p">720p (HD)</option>
                <option value="480p">480p (SD)</option>
              </select>
            </div>

            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <Wifi size={20} className="text-primary" />
                <div>
                  <p className="text-sm font-semibold">Wi-Fi Only Streaming</p>
                  <p className="text-xs text-muted-foreground">Avoid using mobile carrier data</p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleWifiOnly}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  wifiOnly ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                    wifiOnly ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <Bell size={20} className="text-primary" />
                <div>
                  <p className="text-sm font-semibold">Notifications</p>
                  <p className="text-xs text-muted-foreground">Wallet balance and channel updates</p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleNotifications}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  notificationsEnabled ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                    notificationsEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Group 3: Security & Parental Controls */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
            Security & Access
          </h2>
          <div className="mt-4 divide-y divide-border">
            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <Sparkles size={20} className="text-primary" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">Kids Safe Mode</p>
                    {isUnder18 ? (
                      <span className="rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold">
                        Protected Minor
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isUnder18
                      ? "Enforced automatically for accounts under 18 years old"
                      : "Lock interface to family-friendly rated content only"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isUnder18}
                aria-label="Toggle Kids Safe Mode"
                onClick={() => {
                  if (!parentalControlsActive) {
                    setPinPromptOpen(true);
                  } else {
                    toggleKidsMode();
                  }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  kidsModeActive ? "bg-primary" : "bg-muted"
                } ${isUnder18 ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                    kidsModeActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <Shield size={20} className="text-primary" />
                <div>
                  <p className="text-sm font-semibold">Parental Controls</p>
                  <p className="text-xs text-muted-foreground">PIN-protected age rating gate (18+)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPinPromptOpen(true)}
                className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                  parentalControlsActive
                    ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {parentalControlsActive ? "Active (Change)" : "Enable PIN"}
              </button>
            </div>

            <Link to="/account" className="flex items-center justify-between py-3.5 group">
              <div className="flex items-center gap-3">
                <Lock size={20} className="text-primary" />
                <div>
                  <p className="text-sm font-semibold group-hover:text-primary">
                    Account Security
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Sessions, sign-out all devices and password
                  </p>
                </div>
              </div>
              <ChevronRight size={18} className="text-muted-foreground" />
            </Link>
          </div>
        </section>

        {/* Group 4: Legal & Company */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
            Legal & Company
          </h2>
          <div className="mt-4 divide-y divide-border">
            <Link to="/terms" className="flex items-center justify-between py-3 group">
              <span className="text-sm font-medium text-foreground group-hover:text-primary">
                Terms & Conditions
              </span>
              <ChevronRight size={18} className="text-muted-foreground" />
            </Link>
            <Link to="/privacy" className="flex items-center justify-between py-3 group">
              <span className="text-sm font-medium text-foreground group-hover:text-primary">
                Privacy Policy
              </span>
              <ChevronRight size={18} className="text-muted-foreground" />
            </Link>
            <Link to="/contact" className="flex items-center justify-between py-3 group">
              <span className="text-sm font-medium text-foreground group-hover:text-primary">
                Contact Us
              </span>
              <ChevronRight size={18} className="text-muted-foreground" />
            </Link>
            <Link to="/about" className="flex items-center justify-between py-3 group">
              <div>
                <p className="text-sm font-medium text-foreground group-hover:text-primary">
                  About BQ SQWAD TV
                </p>
                <p className="text-xs text-muted-foreground">Version 3.0.0 (Build 2026)</p>
              </div>
              <ChevronRight size={18} className="text-muted-foreground" />
            </Link>
          </div>
        </section>

        {/* Log Out Button */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setConfirmLogoutOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 py-3.5 text-sm font-bold text-destructive transition hover:bg-destructive/20"
          >
            <LogOut size={18} />
            <span>Log Out</span>
          </button>
        </div>
      </div>

      {/* Parental PIN Modal */}
      {pinPromptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleParentalPinSubmit}
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl"
          >
            <h3 className="text-lg font-bold">Parental Controls PIN</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Enter a 4-digit PIN to lock age-restricted and mature content.
            </p>
            <input
              type="password"
              maxLength={4}
              value={parentalPin}
              onChange={(e) => setParentalPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              className="mt-4 w-full rounded-xl border border-border bg-background py-3 text-center text-2xl font-bold tracking-[0.5em] text-foreground focus:border-primary focus:outline-none"
              autoFocus
            />
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setPinPromptOpen(false)}
                className="w-1/2 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={parentalPin.length !== 4}
                className="w-1/2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                Save PIN
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Logout confirmation modal */}
      {confirmLogoutOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl text-center">
            <h3 className="text-lg font-bold">Log out of BQ SQWAD TV?</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              You will need to sign in again to access your wallet, watchlist, and subscriptions.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmLogoutOpen(false)}
                className="w-1/2 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-1/2 rounded-xl bg-destructive py-2.5 text-sm font-bold text-destructive-foreground"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
