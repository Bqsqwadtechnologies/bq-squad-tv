import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Inbox, LoaderCircle, CheckCircle2, MessageSquare, Clock, AlertCircle } from "lucide-react";
import { restoreWebSession } from "@/lib/firebase-web-auth";

type SupportMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "new" | "in_progress" | "resolved";
  notes: string;
  createdAt: string | null;
};

export const Route = createFileRoute("/admin/support")({
  component: AdminSupportPage,
  head: () => ({
    meta: [
      { title: "Support Inbox | Dashboard" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function AdminSupportPage() {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");

  async function loadMessages(idToken: string) {
    try {
      const res = await fetch("/api/public/v1/admin/support/messages", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error("Failed to load support inquiries");
      const data = await res.json() as { messages: SupportMessage[] };
      setMessages(data.messages || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const tokenStr = await restoreWebSession();
      if (!active) return;
      if (tokenStr) {
        setToken(tokenStr);
        void loadMessages(tokenStr);
      } else {
        setError("Sign in required.");
        setBusy(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function updateStatus(messageId: string, status: string, notes?: string) {
    if (!token) return;
    try {
      const res = await fetch("/api/public/v1/admin/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageId, status, notes }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      await loadMessages(token);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Update failed");
    }
  }

  const selected = messages.find(m => m.id === selectedId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900" aria-label="Back to administration dashboard">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="font-bold text-lg text-white">Support Inquiries Inbox</h1>
          </div>
          <Link to="/admin" className="text-xs text-cyan-400 hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        {busy ? (
          <div className="py-24 text-center">
            <LoaderCircle className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading inquiries...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-3">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Inquiries ({messages.length})</h2>
              <div className="space-y-2">
                {messages.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedId(m.id); setNoteInput(m.notes || ""); }}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                      selectedId === m.id 
                        ? "bg-slate-800 border-cyan-500/50" 
                        : "bg-slate-900 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="font-semibold text-xs text-white truncate max-w-[150px]">{m.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase ${
                        m.status === "resolved" 
                          ? "bg-emerald-500/10 text-emerald-400" 
                          : m.status === "in_progress" 
                          ? "bg-amber-500/10 text-amber-400" 
                          : "bg-blue-500/10 text-blue-400"
                      }`}>
                        {m.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 font-medium truncate mb-1">{m.subject}</div>
                    <div className="text-[11px] text-slate-500 truncate">{m.message}</div>
                  </button>
                ))}
                {messages.length === 0 && (
                  <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                    No support inquiries in inbox.
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              {selected ? (
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
                  <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">{selected.subject}</h3>
                      <div className="text-xs text-slate-400">From: <span className="text-slate-200">{selected.name}</span> ({selected.email})</div>
                      {selected.createdAt && (
                        <div className="text-[11px] text-slate-500 mt-0.5">Submitted: {new Date(selected.createdAt).toLocaleString()}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateStatus(selected.id, "in_progress")}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs hover:bg-amber-500/20"
                      >
                        In Progress
                      </button>
                      <button
                        onClick={() => updateStatus(selected.id, "resolved")}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs hover:bg-emerald-500/20"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {selected.message}
                  </div>

                  <div className="space-y-2 pt-2">
                    <label className="block text-xs font-semibold text-slate-400">Internal Operational Notes</label>
                    <textarea
                      rows={3}
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Add resolution or investigation notes here..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                    <button
                      onClick={() => updateStatus(selected.id, selected.status, noteInput)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
                    >
                      Save Notes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-16 text-center rounded-2xl bg-slate-900 border border-slate-800">
                  <Inbox className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Select an inquiry from the left to view details and reply.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
