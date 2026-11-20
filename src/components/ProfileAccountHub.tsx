import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  ChevronRight,
  Clapperboard,
  CreditCard,
  Gift,
  HelpCircle,
  History,
  LogOut,
  Radio,
  Settings,
  ShoppingBag,
  Sparkles,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { getWebAccount, signOutWeb, type ConsoleAccount } from "@/lib/firebase-web-auth";

export function ProfileAccountHub() {
  const [isOpen, setIsOpen] = useState(false);
  const [account, setAccount] = useState<ConsoleAccount | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void getWebAccount().then((acc) => {
      if (active && acc) {
        setAccount(acc);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  async function handleSignOut() {
    await signOutWeb();
    setIsOpen(false);
    window.location.href = "/";
  }

  const userInitial = account?.email ? account.email[0].toUpperCase() : "U";
  const userDisplayName = account?.email ? account.email.split("@")[0] : "Viewer Account";

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button (Profile Avatar) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open Account Hub"
        aria-expanded={isOpen}
        className="grid h-10 w-10 place-items-center rounded-full border border-[#00D8F5]/40 bg-gradient-to-tr from-[#0052D4] to-[#00D8F5] text-white font-bold text-sm shadow-md transition hover:scale-105 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#00D8F5]"
      >
        {account?.email ? userInitial : <UserRound size={18} />}
      </button>

      {/* Account Hub Menu Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-72 sm:w-80 rounded-3xl border border-white/15 bg-[#040E2F]/95 p-4 shadow-2xl backdrop-blur-2xl ring-1 ring-cyan-500/20 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-cyan-400 font-bold text-[#030e28]">
                {userInitial}
              </div>
              <div className="truncate">
                <p className="text-sm font-bold text-white truncate">{userDisplayName}</p>
                <p className="text-xs text-slate-400 truncate">{account?.email || "viewer@bqsqwad.tv"}</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation Links */}
          <div className="mt-3 space-y-1 text-xs">
            <Link
              to="/wallet"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-slate-200 transition hover:bg-white/10 hover:text-cyan-300"
            >
              <span className="flex items-center gap-2.5 font-medium">
                <Wallet size={16} className="text-cyan-400" />
                <span>Wallet & Balance</span>
              </span>
              <ChevronRight size={14} className="text-slate-500" />
            </Link>

            <Link
              to="/library"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-slate-200 transition hover:bg-white/10 hover:text-cyan-300"
            >
              <span className="flex items-center gap-2.5 font-medium">
                <ShoppingBag size={16} className="text-purple-400" />
                <span>Purchases & Watchlist</span>
              </span>
              <ChevronRight size={14} className="text-slate-500" />
            </Link>

            <Link
              to="/history"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-slate-200 transition hover:bg-white/10 hover:text-cyan-300"
            >
              <span className="flex items-center gap-2.5 font-medium">
                <History size={16} className="text-blue-400" />
                <span>Watch History</span>
              </span>
              <ChevronRight size={14} className="text-slate-500" />
            </Link>

            <Link
              to="/account"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-slate-200 transition hover:bg-white/10 hover:text-cyan-300"
            >
              <span className="flex items-center gap-2.5 font-medium">
                <Gift size={16} className="text-amber-400" />
                <span>Referral Program</span>
              </span>
              <ChevronRight size={14} className="text-slate-500" />
            </Link>

            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-slate-200 transition hover:bg-white/10 hover:text-cyan-300"
            >
              <span className="flex items-center gap-2.5 font-medium">
                <Bell size={16} className="text-rose-400" />
                <span>Notifications</span>
              </span>
              <ChevronRight size={14} className="text-slate-500" />
            </Link>

            <Link
              to="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-slate-200 transition hover:bg-white/10 hover:text-cyan-300"
            >
              <span className="flex items-center gap-2.5 font-medium">
                <Settings size={16} className="text-slate-300" />
                <span>Account Settings</span>
              </span>
              <ChevronRight size={14} className="text-slate-500" />
            </Link>

            <Link
              to="/help"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-slate-200 transition hover:bg-white/10 hover:text-cyan-300"
            >
              <span className="flex items-center gap-2.5 font-medium">
                <HelpCircle size={16} className="text-slate-300" />
                <span>Help & Support</span>
              </span>
              <ChevronRight size={14} className="text-slate-500" />
            </Link>

            {/* Consoles Section */}
            <div className="pt-2 pb-1 border-t border-white/10 mt-2">
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Consoles
              </span>
              <a
                href="/producer"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-slate-200 transition hover:bg-white/10 hover:text-cyan-300"
              >
                <span className="flex items-center gap-2.5 font-medium">
                  <Clapperboard size={15} className="text-cyan-400" />
                  <span>Producer Console</span>
                </span>
                <ChevronRight size={13} className="text-slate-500" />
              </a>

              <a
                href="/provider"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-slate-200 transition hover:bg-white/10 hover:text-cyan-300"
              >
                <span className="flex items-center gap-2.5 font-medium">
                  <Radio size={15} className="text-indigo-400" />
                  <span>Provider Console</span>
                </span>
                <ChevronRight size={13} className="text-slate-500" />
              </a>
            </div>

            {/* Sign Out */}
            <div className="pt-2 border-t border-white/10 mt-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-rose-400 transition hover:bg-rose-500/10 font-medium"
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
