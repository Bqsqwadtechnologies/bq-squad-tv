import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import {
  Bell, ChevronRight, Eye, Globe, Lock, LogOut,
  Moon, Shield, Sliders, Smartphone, Volume2, Wifi,
  AlertTriangle, Check
} from "lucide-react";
import { getWebAccount, signOutWeb } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings — BQ SQWAD TV" },
      { name: "description", content: "Manage playback quality, notifications, security and preferences." },
    ],
  }),
});

function SettingsPage() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [playbackQuality, setPlaybackQuality] = useState("Auto");
  const [wifiOnly, setWifiOnly] = useState(false);
  const [parentalControlsActive, setParentalControlsActive] = useState(false);
  const [parentalPin, setParentalPin] = useState("");
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  useEffect(() => {
    try {
      const savedNotifs = localStorage.getItem("bq-sqwad-notifs");
      if (savedNotifs !== null) setNotificationsEnabled(savedNotifs === "true");

      const savedQuality = localStorage.getItem("bq-sqwad-quality");
      if (savedQuality) setPlaybackQuality(savedQuality);

      const savedWifi = localStorage.getItem("bq-sqwad-wifi-only");
      if (savedWifi !== null) setWifiOnly(savedWifi === "true");

      const savedParental = localStorage.getItem("bq-sqwad-parental");
      if (savedParental !== null) setParentalControlsActive(savedParental === "true");
    } catch {}
  }, []);

  function triggerSaveToast() {
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
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

  function handleParentalPinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parentalPin.length === 4) {
      const next = !parentalControlsActive;
      setParentalControlsActive(next);
      localStorage.setItem("bq-sqwad-parental", String(next));
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
    <div className="min-h-screen bg-gradient-to-b from-[#030B2A] via-[#07143D] to-[#0A1A4A] text-white px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between pb-6 border-b border-white/10">
          <Link to="/" aria-label="BQ SQWAD TV home">
            <BrandLogo variant="horizontal" className="h-8 w-auto" />
          </Link>
          <Link to="/account" className="text-sm font-semibold text-[#00D8F5] hover:underline">
            Back to Account
          </Link>
        </header>

        <div className="mt-8 flex items-center justify-between">
          <h1 className="text-2xl font-black">Settings</h1>
          {saveToast ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#00D8F5]/20 px-3 py-1 text-xs font-bold text-[#00D8F5]">
              <Check size={14} /> Saved
            </span>
          ) : null}
        </div>

        {/* Group 1: Preferences & Playback */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-[#0C1738]/80 p-5 backdrop-blur-md">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#00D8F5]">Playback & Network</h2>
          <div className="mt-4 divide-y divide-white/10">
            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <Sliders size={20} className="text-[#00D8F5]" />
                <div>
                  <p className="text-sm font-semibold">Playback Quality</p>
                  <p className="text-xs text-slate-400">Stream resolution adaptation</p>
                </div>
              </div>
              <select
                value={playbackQuality}
                onChange={(e) => changeQuality(e.target.value)}
                className="rounded-xl border border-white/15 bg-[#030B2A] px-3 py-1.5 text-xs font-bold text-[#00D8F5]"
              >
                <option value="Auto">Auto</option>
                <option value="1080p">1080p (FHD)</option>
                <option value="720p">720p (HD)</option>
                <option value="480p">480p (SD)</option>
              </select>
            </div>

            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <Wifi size={20} className="text-[#00D8F5]" />
                <div>
                  <p className="text-sm font-semibold">Wi-Fi Only Streaming</p>
                  <p className="text-xs text-slate-400">Avoid using mobile carrier data</p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleWifiOnly}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  wifiOnly ? "bg-[#00D8F5]" : "bg-white/20"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    wifiOnly ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <Bell size={20} className="text-[#00D8F5]" />
                <div>
                  <p className="text-sm font-semibold">Notifications</p>
                  <p className="text-xs text-slate-400">Wallet balance and channel updates</p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleNotifications}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  notificationsEnabled ? "bg-[#00D8F5]" : "bg-white/20"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    notificationsEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Group 2: Security & Parental Controls */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-[#0C1738]/80 p-5 backdrop-blur-md">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#00D8F5]">Security & Access</h2>
          <div className="mt-4 divide-y divide-white/10">
            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <Shield size={20} className="text-[#00D8F5]" />
                <div>
                  <p className="text-sm font-semibold">Parental Controls</p>
                  <p className="text-xs text-slate-400">PIN-protected age rating gate (18+)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPinPromptOpen(true)}
                className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                  parentalControlsActive
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-white/10 text-slate-300 hover:bg-white/15"
                }`}
              >
                {parentalControlsActive ? "Active (Change)" : "Enable PIN"}
              </button>
            </div>

            <Link to="/account" className="flex items-center justify-between py-3.5 group">
              <div className="flex items-center gap-3">
                <Lock size={20} className="text-[#00D8F5]" />
                <div>
                  <p className="text-sm font-semibold group-hover:text-[#00D8F5]">Account Security</p>
                  <p className="text-xs text-slate-400">Sessions, sign-out all devices and password</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-400" />
            </Link>
          </div>
        </section>

        {/* Group 3: Legal & Support */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-[#0C1738]/80 p-5 backdrop-blur-md">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#00D8F5]">Legal & Company</h2>
          <div className="mt-4 divide-y divide-white/10">
            <Link to="/legal/terms" className="flex items-center justify-between py-3 group">
              <span className="text-sm font-medium text-slate-200 group-hover:text-[#00D8F5]">Terms & Conditions</span>
              <ChevronRight size={18} className="text-slate-400" />
            </Link>
            <Link to="/legal/privacy" className="flex items-center justify-between py-3 group">
              <span className="text-sm font-medium text-slate-200 group-hover:text-[#00D8F5]">Privacy Policy</span>
              <ChevronRight size={18} className="text-slate-400" />
            </Link>
            <Link to="/contact" className="flex items-center justify-between py-3 group">
              <span className="text-sm font-medium text-slate-200 group-hover:text-[#00D8F5]">Contact Us</span>
              <ChevronRight size={18} className="text-slate-400" />
            </Link>
            <Link to="/about" className="flex items-center justify-between py-3 group">
              <div>
                <p className="text-sm font-medium text-slate-200 group-hover:text-[#00D8F5]">About BQ SQWAD TV</p>
                <p className="text-xs text-slate-400">Version 3.0.0 (Build 2026)</p>
              </div>
              <ChevronRight size={18} className="text-slate-400" />
            </Link>
          </div>
        </section>

        {/* Log Out Button */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setConfirmLogoutOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 py-3.5 text-sm font-bold text-red-400 transition hover:bg-red-500/20"
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
            className="w-full max-w-sm rounded-3xl border border-cyan-400/30 bg-[#0C1738] p-6 shadow-2xl"
          >
            <h3 className="text-lg font-bold">Parental Controls PIN</h3>
            <p className="mt-2 text-xs text-slate-300">
              Enter a 4-digit PIN to lock age-restricted and mature content.
            </p>
            <input
              type="password"
              maxLength={4}
              value={parentalPin}
              onChange={(e) => setParentalPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              className="mt-4 w-full rounded-xl border border-white/20 bg-[#030B2A] py-3 text-center text-2xl font-bold tracking-[0.5em] text-white focus:border-[#00D8F5] focus:outline-none"
              autoFocus
            />
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setPinPromptOpen(false)}
                className="w-1/2 rounded-xl border border-white/20 py-2.5 text-sm font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={parentalPin.length !== 4}
                className="w-1/2 rounded-xl bg-gradient-to-r from-[#0052D4] to-[#00D8F5] py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                Save PIN
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Confirm Logout Modal */}
      {confirmLogoutOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-red-500/30 bg-[#0C1738] p-6 text-center shadow-2xl">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-500/15 text-red-400">
              <AlertTriangle size={24} />
            </div>
            <h3 className="mt-4 text-lg font-bold">Log out of your account?</h3>
            <p className="mt-2 text-xs text-slate-300">
              You will need to sign in again to access your wallet, favorites, and watch history.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmLogoutOpen(false)}
                className="w-1/2 rounded-xl border border-white/20 py-2.5 text-sm font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-1/2 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white transition hover:bg-red-600"
              >
                Yes, Log Out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
