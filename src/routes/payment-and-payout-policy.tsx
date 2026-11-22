import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Calendar, CreditCard, AlertCircle, FileText, ArrowLeft } from "lucide-react";
import { PAYOUT_WINDOW_DISCLOSURE, getNextPayoutWindow } from "@/lib/payout-calendar";

export const Route = createFileRoute("/payment-and-payout-policy")({
  component: PaymentAndPayoutPolicyPage,
  head: () => ({
    meta: [
      { title: "Payment and Payout Policy | BQ SQWAD TV" },
      {
        name: "description",
        content:
          "Official BQ SQWAD TV payment schedule, payout window, threshold requirements, KYC compliance, and settlement policies.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
});

function PaymentAndPayoutPolicyPage() {
  const windowInfo = getNextPayoutWindow();

  return (
    <div className="min-h-screen bg-[#02081e] text-white">
      {/* Top Banner */}
      <header className="border-b border-white/10 bg-[#040d2d]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to BQ SQWAD TV</span>
          </Link>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Official Platform Policy
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <div className="flex items-center gap-3 text-cyan-300">
          <ShieldCheck className="h-6 w-6" />
          <span className="text-xs font-black uppercase tracking-widest">Financial Transparency</span>
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl text-white">
          Payment & Payout Policy
        </h1>
        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          This document governs disbursement schedules, minimum thresholds, identity verification
          mandates, and ledger permanence for all content producers, rights holders, and licensed
          distribution partners.
        </p>

        {/* Schedule Highlight Box */}
        <div className="mt-8 rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/40 via-[#07133f] to-[#040c2e] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <Calendar className="h-7 w-7 text-cyan-300 shrink-0 mt-1" />
            <div>
              <h2 className="text-lg font-bold text-white">Monthly Disbursement Schedule</h2>
              <p className="mt-2 text-sm leading-6 text-cyan-100/90 font-medium">
                {PAYOUT_WINDOW_DISCLOSURE}
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-400/10 px-4 py-2 border border-cyan-400/20 text-xs font-mono text-cyan-200">
                <span>Upcoming Scheduled Window:</span>
                <strong className="text-white">{windowInfo.nextPayoutDateFormatted}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Policy Sections */}
        <div className="mt-10 space-y-8 text-sm leading-7 text-slate-300">
          <section className="rounded-2xl border border-white/5 bg-[#040d2d] p-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-cyan-300" />
              1. Minimum Payout Thresholds
            </h2>
            <p className="mt-3">
              To prevent excessive intermediary processing and banking charges, disbursements are
              initiated only once an account's confirmed, payable earnings exceed the designated
              threshold:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1.5 text-slate-300">
              <li>
                <strong className="text-white">NGN Accounts:</strong> Minimum balance of ₦5,000.
              </li>
              <li>
                <strong className="text-white">USD / Global Accounts:</strong> Minimum balance of $25.00 USD (or local currency equivalent).
              </li>
            </ul>
            <p className="mt-3 text-xs text-slate-400">
              Earnings below the designated threshold remain fully preserved and automatically roll
              over into the subsequent disbursement cycle without penalty or expiration.
            </p>
          </section>

          <section className="rounded-2xl border border-white/5 bg-[#040d2d] p-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-cyan-300" />
              2. KYC & Identity Verification Compliance
            </h2>
            <p className="mt-3">
              In accordance with international anti-money laundering (AML) and financial compliance
              regulations, all producers and channel providers must undergo verified Know Your
              Customer (KYC) clearance prior to their first disbursement:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1.5 text-slate-300">
              <li>Valid government-issued national identity documentation (passport, national ID, or driver's license).</li>
              <li>Proof of bank account ownership matching the registered legal or corporate entity name.</li>
              <li>Tax identification number where mandated by local jurisdiction.</li>
            </ul>
            <p className="mt-3 text-xs text-amber-300/90 font-medium">
              Disbursements requested by accounts with unverified or suspended KYC status are placed on
              hold until credentials are fully confirmed.
            </p>
          </section>

          <section className="rounded-2xl border border-white/5 bg-[#040d2d] p-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan-300" />
              3. Permanent Financial Records & Reversal Protocol
            </h2>
            <p className="mt-3">
              The platform maintains an immutable, double-entry financial ledger. In accordance with
              strict compliance guidelines:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1.5 text-slate-300">
              <li><strong className="text-white">No Record Deletion:</strong> Payment records and statements are permanently retained and cannot be deleted or purged from the database.</li>
              <li><strong className="text-white">Reversal Entries:</strong> Corrections, banking rejections, or dispute clawbacks are recorded strictly through linked reversal documents preserving complete timestamps and reference IDs.</li>
              <li><strong className="text-white">PDF Statements:</strong> Verified monthly settlement statements are cryptographically hashed and downloadable as signed PDF documents from partner consoles.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-white/5 bg-[#040d2d] p-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-cyan-300" />
              4. Processing Delays & Inquiries
            </h2>
            <p className="mt-3">
              While disbursements are executed by platform operators between the 30th and the 1st of
              each month, settlement times are subject to regional banking networks, clearing house
              operating hours, public holidays, and correspondent bank procedures.
            </p>
            <p className="mt-3 text-xs text-slate-400">
              If your payment reference indicates "Paid" but funds have not cleared after five business
              days from the execution date, contact financial support at{" "}
              <a href="mailto:tv@bqsqwad.com" className="text-cyan-300 underline font-semibold">
                tv@bqsqwad.com
              </a>{" "}
              with your statement reference ID.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
