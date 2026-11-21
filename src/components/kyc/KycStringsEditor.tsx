import React, { useState, useEffect } from "react";
import { Sliders, Save, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { DEFAULT_KYC_STRINGS } from "@/lib/kyc-strings";

interface KycStringsEditorProps {
  token?: string;
}

export function KycStringsEditor({ token }: KycStringsEditorProps) {
  const [strings, setStrings] = useState<Record<string, string>>({ ...DEFAULT_KYC_STRINGS });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    fetchStrings();
  }, [token]);

  async function fetchStrings() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/v1/kyc/strings");
      if (res.ok) {
        const data = await res.json();
        if (data.strings) {
          setStrings(data.strings);
        }
      }
    } catch {
      // Non-blocking fallback to defaults
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!reason.trim() || reason.trim().length < 5) {
      setError("Please provide a valid audit reason (minimum 5 characters) for updating KYC copy strings.");
      return;
    }

    setSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/public/v1/kyc/strings", {
        method: "POST",
        headers,
        body: JSON.stringify({
          updates: strings,
          reason: reason.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || "Failed to update strings");
      }

      setStatusMessage("KYC copy strings updated successfully and recorded in audit log.");
      setReason("");
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || "An error occurred while saving strings.");
    } finally {
      setSaving(false);
    }
  }

  const entries = Object.entries(strings).filter(([key, val]) => {
    if (!filter) return true;
    const lower = filter.toLowerCase();
    return key.toLowerCase().includes(lower) || val.toLowerCase().includes(lower);
  });

  return (
    <div className="space-y-6 rounded-2xl border border-white/10 bg-[#0a1533]/80 p-6 text-white shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Sliders className="h-5 w-5 text-cyan-400" />
            <span>Applicant Copy & Help Strings (RTL & Localization Ready)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Customize labels, tooltips, field help, and accessibility copy shown to creators during identity verification.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchStrings}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Reload</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by string key or content (e.g. nin, phone, status)..."
          className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs text-white placeholder-slate-400 focus:border-cyan-500 focus:outline-none"
        />
        <span className="text-xs text-slate-400 font-mono">
          {entries.length} string{entries.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="max-h-[500px] overflow-y-auto rounded-xl border border-white/10 bg-slate-900/60 p-4 space-y-4">
        {entries.map(([key, val]) => (
          <div key={key} className="space-y-1 rounded-lg border border-slate-800 bg-slate-800/30 p-3">
            <div className="flex items-center justify-between text-[11px] font-mono text-cyan-400">
              <span>{key}</span>
              {val !== DEFAULT_KYC_STRINGS[key] && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300 font-sans">
                  Customized
                </span>
              )}
            </div>
            {val.length > 80 ? (
              <textarea
                value={val}
                onChange={(e) => setStrings({ ...strings, [key]: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            ) : (
              <input
                type="text"
                value={val}
                onChange={(e) => setStrings({ ...strings, [key]: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Mandatory audit reason for copy change (e.g. Updated NIN tooltip wording)..."
          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs text-white placeholder-slate-400 focus:border-cyan-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2 text-xs font-bold text-[#031039] hover:bg-cyan-400 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? "Saving Changes..." : "Save Copy Changes"}</span>
        </button>
      </div>
    </div>
  );
}
