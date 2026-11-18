import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, AlertCircle, LoaderCircle, MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { restoreWebSession } from "@/lib/firebase-web-auth";

type Dispute = {
  id: string;
  subject: string;
  statementId: string | null;
  status: string;
  createdAt: string;
  messages: Array<{
    sender: string;
    text: string;
    timestamp: string;
  }>;
};

export const Route = createFileRoute("/provider/disputes")({
  component: ProviderDisputesPage,
  head: () => ({
    meta: [
      { title: "Disputes & Support | Partner Portal" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProviderDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  
  // New dispute form
  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState("");
  const [statementId, setStatementId] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadDisputes(idToken: string) {
    try {
      const res = await fetch("/api/public/v1/provider/disputes", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error("Failed to load disputes");
      const data = await res.json() as { disputes: Dispute[] };
      setDisputes(data.disputes || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await restoreWebSession();
      if (!active) return;
      if (session?.idToken) {
        setToken(session.idToken);
        void loadDisputes(session.idToken);
      } else {
        setError("Please sign in from the partner portal home.");
        setBusy(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/v1/provider/disputes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subject, statementId, message }),
      });
      if (!res.ok) throw new Error("Failed to submit inquiry");
      setSubject("");
      setStatementId("");
      setMessage("");
      setShowNew(false);
      await loadDisputes(token);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/provider" className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="font-bold text-lg text-white">Disputes & Operations Inquiries</h1>
          </div>
          <Link to="/provider" className="text-xs text-cyan-400 hover:underline">
            Partner Dashboard
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
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">Direct Channel Support & Disputes</h2>
                <p className="text-xs text-slate-400">Private communication thread between your organisation and operations.</p>
              </div>

              {!showNew && (
                <button
                  onClick={() => setShowNew(true)}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center gap-2 self-start"
                >
                  <MessageSquare className="w-4 h-4" />
                  New Inquiry / Dispute
                </button>
              )}
            </div>

            {showNew && (
              <form onSubmit={handleSubmit} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                <h3 className="font-bold text-sm text-white">Submit New Inquiry or Statement Dispute</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Subject</label>
                    <input
                      type="text"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. October Statement Query"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Related Statement ID (Optional)</label>
                    <input
                      type="text"
                      value={statementId}
                      onChange={(e) => setStatementId(e.target.value)}
                      placeholder="e.g. st_12345"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Details</label>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Provide full details regarding the statement discrepancy or stream operation issue..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Submit Inquiry
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNew(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {disputes.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800">
                <CheckCircle2 className="w-12 h-12 text-emerald-500/40 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-white mb-1">No active disputes or inquiries</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  All accounts and live broadcasts are operating normally.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {disputes.map((d) => (
                  <div key={d.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-sm text-white">{d.subject}</h4>
                        <div className="text-xs text-slate-400">Created: {new Date(d.createdAt).toLocaleDateString()}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        {d.status}
                      </span>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      {d.messages.map((m, idx) => (
                        <div key={idx} className={`p-3 rounded-xl text-xs ${
                          m.sender === "provider" ? "bg-slate-950 border border-slate-800 ml-4" : "bg-cyan-950/20 border border-cyan-900/30 mr-4"
                        }`}>
                          <div className="font-semibold text-slate-300 mb-1 flex items-center justify-between">
                            <span>{m.sender === "provider" ? "Your Organisation" : "BQ SQWAD TV Operations"}</span>
                            <span className="text-[10px] text-slate-500">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-slate-300">{m.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
