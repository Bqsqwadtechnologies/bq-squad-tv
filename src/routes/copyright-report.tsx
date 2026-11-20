import { useState, useEffect, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/copyright-report")({
  component: CopyrightReportPage,
  head: () => ({
    meta: [
      { title: "Copyright Infringement Notice | BQ SQWAD TV" },
      {
        name: "description",
        content:
          "Submit a formal copyright infringement or DMCA takedown notice for content on BQ SQWAD TV.",
      },
    ],
  }),
});

function CopyrightReportPage() {
  const [reporterName, setReporterName] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [reporterOrganization, setReporterOrganization] = useState("");
  const [targetType, setTargetType] = useState<"content_asset" | "channel">("content_asset");
  const [targetId, setTargetId] = useState("");
  const [workClaimed, setWorkClaimed] = useState("");
  const [proofLinkOrPath, setProofLinkOrPath] = useState("");
  const [goodFaithStatement, setGoodFaithStatement] = useState(false);
  const [accuracyStatement, setAccuracyStatement] = useState(false);
  const [signature, setSignature] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [caseSuccess, setCaseSuccess] = useState<{
    caseId?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qAsset = params.get("assetId") || params.get("videoId");
      const qChannel = params.get("channelId");
      if (qAsset) {
        setTargetType("content_asset");
        setTargetId(qAsset);
      } else if (qChannel) {
        setTargetType("channel");
        setTargetId(qChannel);
      }
    }
  }, []);

  async function submitReport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!goodFaithStatement || !accuracyStatement) {
      setError("Please confirm both required statements of good faith and accuracy.");
      return;
    }

    if (!signature.trim()) {
      setError("Please provide an electronic signature (type your full legal name).");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/public/v1/content-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId: targetId.trim(),
          reason: "copyright_infringement",
          reporterName: reporterName.trim(),
          reporterEmail: reporterEmail.trim(),
          reporterOrganization: reporterOrganization.trim() || undefined,
          workClaimed: workClaimed.trim(),
          proofLinkOrPath: proofLinkOrPath.trim() || undefined,
          goodFaithStatement: true,
          signature: signature.trim(),
          declaration: true,
          website_url: honeypot || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not submit copyright report. Please try again.");
      }

      setCaseSuccess({
        caseId: data.caseId || data.reportId,
        message: data.message || "Your report has been received and opened for immediate review.",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#02081d] px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white mb-6"
        >
          <ArrowLeft size={14} /> Back to BQ SQWAD TV
        </a>

        <div className="rounded-3xl border border-white/10 bg-[#061033] p-6 sm:p-10 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/10 pb-6">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/10 text-amber-400 border border-amber-400/20">
              <ShieldAlert size={28} />
            </div>
            <div>
              <h1 className="text-xl font-black text-white sm:text-2xl">
                Notice of Copyright Infringement
              </h1>
              <p className="text-xs text-slate-300">
                Submit a formal takedown notice for protected audiovisual or creative works.
              </p>
            </div>
          </div>

          {caseSuccess ? (
            <div className="mt-8 space-y-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-6 text-center">
              <CheckCircle2 size={40} className="mx-auto text-emerald-400" />
              <h2 className="text-lg font-bold text-white">Copyright Notice Registered</h2>
              <p className="text-sm text-slate-300">{caseSuccess.message}</p>
              {caseSuccess.caseId && (
                <p className="font-mono text-xs text-cyan-300">Case Reference: {caseSuccess.caseId}</p>
              )}
              <div className="pt-2 text-xs text-slate-400">
                <p>
                  An email receipt has been dispatched to <strong>{reporterEmail}</strong>.
                </p>
                <p className="mt-1">
                  The targeted video has been placed into the moderation review queue and the 14-day
                  counter-notice window has commenced.
                </p>
              </div>
              <div className="pt-4">
                <a
                  href="/"
                  className="inline-block rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110"
                >
                  Return to Home
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={submitReport} className="mt-8 space-y-6">
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-xs font-semibold text-rose-200">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Honeypot field */}
              <input
                type="text"
                name="website_url"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden="true"
              />

              {/* Reporter details */}
              <div className="space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  1. Rights Holder & Claimant Information
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Full Legal Name *
                    </label>
                    <input
                      required
                      value={reporterName}
                      onChange={(e) => setReporterName(e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="w-full rounded-xl border border-white/10 bg-[#030a24] px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Contact Email *
                    </label>
                    <input
                      required
                      type="email"
                      value={reporterEmail}
                      onChange={(e) => setReporterEmail(e.target.value)}
                      placeholder="e.g. legal@example.com"
                      className="w-full rounded-xl border border-white/10 bg-[#030a24] px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Organization / Studio / Company (optional)
                  </label>
                  <input
                    value={reporterOrganization}
                    onChange={(e) => setReporterOrganization(e.target.value)}
                    placeholder="e.g. Apex Pictures Ltd."
                    className="w-full rounded-xl border border-white/10 bg-[#030a24] px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Target content */}
              <div className="space-y-4 pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  2. Targeted Infringing Content
                </h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Content Type
                    </label>
                    <select
                      value={targetType}
                      onChange={(e) =>
                        setTargetType(e.target.value as "content_asset" | "channel")
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#030a24] px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="content_asset">Video / Asset</option>
                      <option value="channel">Channel / Live Broadcast</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Video ID, Channel ID, or URL *
                    </label>
                    <input
                      required
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      placeholder="e.g. vid_abc123 or https://..."
                      className="w-full rounded-xl border border-white/10 bg-[#030a24] px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Work claimed */}
              <div className="space-y-4 pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  3. Copyrighted Work & Ownership
                </h2>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Description of the Claimed Copyrighted Work *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={workClaimed}
                    onChange={(e) => setWorkClaimed(e.target.value)}
                    placeholder="Provide specific details identifying your copyrighted film, episode, musical score, or script that you allege has been infringed."
                    className="w-full rounded-xl border border-white/10 bg-[#030a24] px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Proof Link or Public Registration Reference (optional)
                  </label>
                  <input
                    value={proofLinkOrPath}
                    onChange={(e) => setProofLinkOrPath(e.target.value)}
                    placeholder="e.g. Official copyright catalogue link, IMDb, or distribution contract URL"
                    className="w-full rounded-xl border border-white/10 bg-[#030a24] px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Legal affirmations & signature */}
              <div className="space-y-4 pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  4. Statements of Authority & Signature
                </h2>
                <div className="space-y-3 rounded-2xl border border-white/10 bg-[#030a24]/60 p-4 text-xs text-slate-300 leading-relaxed">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={goodFaithStatement}
                      onChange={(e) => setGoodFaithStatement(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded accent-cyan-400"
                    />
                    <span>
                      I have a good faith belief that the use of the material in the manner
                      complained of is not authorized by the copyright owner, its agent, or the law.
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={accuracyStatement}
                      onChange={(e) => setAccuracyStatement(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded accent-cyan-400"
                    />
                    <span>
                      I affirm under penalty of perjury that the information in this notification
                      is accurate and that I am the copyright owner or authorized to act on behalf of
                      the owner of the exclusive right that is allegedly infringed.
                    </span>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Electronic Signature (Type your full legal name) *
                  </label>
                  <input
                    required
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    placeholder="Type your legal full name"
                    className="w-full rounded-xl border border-white/10 bg-[#030a24] px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-white/10">
                <a
                  href="/"
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Cancel
                </a>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-amber-400 px-6 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110 disabled:opacity-50"
                >
                  {busy ? "Submitting Notice..." : "Submit Copyright Notice"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
