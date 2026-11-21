import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Shield, CheckCircle, Mail, ExternalLink, Lock, Eye, FileText, Clock, Trash2 } from "lucide-react";

export const Route = createFileRoute("/help/data-protection")({
  component: DataProtectionTrustPage,
  head: () => ({
    meta: [
      { title: "Data Protection & Trust | BQ SQWAD TV" },
      {
        name: "description",
        content:
          "Plain-language explanation of how we collect, encrypt, verify, retain, and protect your identity and payout information.",
      },
    ],
  }),
});

function DataProtectionTrustPage() {
  const toc = [
    { id: "what-we-collect", label: "1. What we collect and why" },
    { id: "how-we-protect", label: "2. How we protect your information" },
    { id: "identity-verification", label: "3. Identity and face verification" },
    { id: "payment-details", label: "4. Payment details and wire transfers" },
    { id: "retention", label: "5. How long we keep information" },
    { id: "your-rights", label: "6. Your rights and how to request access or deletion" },
    { id: "contact", label: "7. Contact our team" },
  ];

  return (
    <main className="min-h-screen bg-[#050c26] text-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <a href="/help" className="inline-flex items-center gap-1.5 font-bold text-cyan-400 hover:text-cyan-300">
            <ArrowLeft size={15} /> Help Centre
          </a>
          <span>/</span>
          <span className="text-slate-300">Data Protection & Trust</span>
        </div>

        {/* Header Hero */}
        <header className="mt-8 rounded-3xl border border-white/10 bg-[#07143d] p-6 sm:p-10 shadow-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-300">
            <Shield className="h-4 w-4" />
            <span>Privacy & Security Notice</span>
          </div>
          <h1 className="mt-4 text-3xl font-black text-white sm:text-4xl tracking-tight">
            Data Protection & Trust
          </h1>
          <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-300">
            Your information is encrypted and protected. We collect and use it only to verify your identity,
            prevent fraudulent activity, and ensure your earnings reach you reliably through secure bank wire transfers.
          </p>

          {/* Quick Notice Highlight */}
          <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-950/30 p-4 text-xs text-emerald-200 flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Our pledge:</strong> We never sell your personal data, we do not monetize your documents,
              and we collect only what is strictly required to satisfy regulatory obligations and execute wire disbursements.
            </p>
          </div>
        </header>

        {/* Table of Contents */}
        <nav aria-label="Table of contents" className="mt-8 rounded-2xl border border-white/10 bg-[#07143d]/70 p-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Contents</h2>
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {toc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="text-cyan-300 hover:text-cyan-200 hover:underline block py-1"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content Sections */}
        <div className="mt-10 space-y-12 divide-y divide-white/10 text-slate-300 text-sm leading-relaxed">
          {/* Section 1 */}
          <section id="what-we-collect" className="pt-8">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan-400" />
              <span>1. What we collect and why</span>
            </h2>
            <div className="mt-4 space-y-3">
              <p>
                When you create an account, register as a content producer, or join as a service provider, we collect:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white">Account Details:</strong> Your name, email address, phone number, and account credentials so you can securely sign in and manage your channels and services.
                </li>
                <li>
                  <strong className="text-white">Identity Documents:</strong> A government-issued photo ID (national ID card, international passport, driver's licence, or voter's card), date of birth, and residential address to verify that you are at least 18 years old and eligible to contract.
                </li>
                <li>
                  <strong className="text-white">Business Registration (for corporate accounts):</strong> Certificate of incorporation, registered business address, tax registration number, and details of authorised representatives.
                </li>
                <li>
                  <strong className="text-white">Payout Bank Details:</strong> Beneficiary legal name, bank name, bank branch, and account number or IBAN, necessary to deliver wire transfer payouts to your nominated institution.
                </li>
              </ul>
              <p>
                We do not collect information that is not directly related to providing our platform services or fulfilling legal compliance mandates.
              </p>
            </div>
          </section>

          {/* Section 2 */}
          <section id="how-we-protect" className="pt-8">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Lock className="h-5 w-5 text-cyan-400" />
              <span>2. How we protect your information</span>
            </h2>
            <div className="mt-4 space-y-3">
              <p>
                We apply multiple layers of security to ensure your personal and financial information remains confidential and protected:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white">Encryption in Transit:</strong> All data exchanged between your browser and our services is encrypted using modern TLS (Transport Layer Security) protocols.
                </li>
                <li>
                  <strong className="text-white">Encryption at Rest:</strong> Sensitive identity fields, national identity numbers, and bank account details are encrypted using cryptographic standards before being stored in our database.
                </li>
                <li>
                  <strong className="text-white">Strict Access Control:</strong> Access to identity files and unmasked banking details is restricted to authorised personnel who require access to review compliance or authorise wire disbursements.
                </li>
                <li>
                  <strong className="text-white">Immutable Audit Logging:</strong> Every view, reveal, export, or status modification of identity and banking records is permanently recorded with the timestamp, user, and stated reason.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 3 */}
          <section id="identity-verification" className="pt-8">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Eye className="h-5 w-5 text-cyan-400" />
              <span>3. Identity and face verification</span>
            </h2>
            <div className="mt-4 space-y-3">
              <p>
                To protect our platform against impersonation, automated abuse, and financial fraud, producers and providers complete identity verification before receiving disbursements:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white">Document Check:</strong> We verify the authenticity and validity dates of the submitted identification document.
                </li>
                <li>
                  <strong className="text-white">Face Liveness:</strong> A brief camera check verifies that the person submitting the document is physically present, preventing the use of stolen photographs or static imagery.
                </li>
                <li>
                  <strong className="text-white">No Public Exposure:</strong> Your submitted identity photos, selfies, and verification videos are never published, shared with other users, or used for training promotional models.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 4 */}
          <section id="payment-details" className="pt-8">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-cyan-400" />
              <span>4. Payment details and wire transfers</span>
            </h2>
            <div className="mt-4 space-y-3">
              <p>
                Payouts to producers and service providers are conducted exclusively via bank wire transfer:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white">Country Alignment:</strong> To comply with international anti-money laundering and wire transfer standards, your payout bank account must be located in the same country verified during your identity verification.
                </li>
                <li>
                  <strong className="text-white">Masked Account Display:</strong> Account numbers and IBANs are masked across all summary screens and statements, showing only the final digits for your verification.
                </li>
                <li>
                  <strong className="text-white">Minimum Payout Threshold:</strong> The minimum payout threshold is $500 (or the local currency equivalent). Earnings below this amount accumulate safely in your balance until the threshold is met.
                </li>
                <li>
                  <strong className="text-white">Verified Receipts:</strong> Once a payout is marked paid, an official transaction receipt is generated in your console and emailed to your registered address with the reference number and settlement details.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 5 */}
          <section id="retention" className="pt-8">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-cyan-400" />
              <span>5. How long we keep information</span>
            </h2>
            <div className="mt-4 space-y-3">
              <p>
                We retain your information only for as long as necessary to provide platform services, maintain accurate financial records, and comply with regulatory and tax retention obligations:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white">Active Accounts:</strong> We retain profile and channel data while your account remains active.
                </li>
                <li>
                  <strong className="text-white">Verification Files:</strong> Identity documents and verification records are retained during your active participation and for the statutory duration required by financial regulatory authorities following account closure.
                </li>
                <li>
                  <strong className="text-white">Financial & Tax Records:</strong> Wire transfer records, ledger distributions, and settlement receipts are preserved for a minimum of 7 years in compliance with standard commercial and accounting requirements.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 6 */}
          <section id="your-rights" className="pt-8">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-cyan-400" />
              <span>6. Your rights and how to request access or deletion</span>
            </h2>
            <div className="mt-4 space-y-3">
              <p>
                You have significant rights concerning the personal information we maintain:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white">Right of Access:</strong> You can review your profile information, earnings history, and statements directly inside your console at any time.
                </li>
                <li>
                  <strong className="text-white">Right of Correction:</strong> If your legal name, registered business, or banking details change, you can submit updated information through the verification workflow.
                </li>
                <li>
                  <strong className="text-white">Right of Deletion:</strong> You may request the deletion of your account and personal data. Where statutory financial retention rules apply, we securely archive mandatory accounting records while removing optional profile data from active systems.
                </li>
              </ul>
              <p>
                To exercise any of these rights, contact us at the address below.
              </p>
            </div>
          </section>

          {/* Section 7 */}
          <section id="contact" className="pt-8">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Mail className="h-5 w-5 text-cyan-400" />
              <span>7. Contact our team</span>
            </h2>
            <div className="mt-4 rounded-2xl border border-white/10 bg-[#07143d] p-6 space-y-3">
              <p>
                If you have questions about our data protection practices, wish to request an export of your information, or want to submit an inquiry regarding your verification:
              </p>
              <div className="flex items-center gap-3">
                <a
                  href="mailto:tv@bqsqwad.com"
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-bold text-black hover:bg-cyan-400 transition"
                >
                  <Mail className="h-4 w-4" />
                  <span>Email tv@bqsqwad.com</span>
                </a>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                For security reasons, do not include unencrypted ID scans, account passwords, or verification codes in regular email communications.
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-16 border-t border-white/10 py-8 text-center text-xs text-slate-500">
          <p>BQ SQWAD TV · Bq Sqwad Technologies</p>
          <div className="mt-2 flex justify-center gap-4">
            <a href="/legal/terms" className="text-slate-400 hover:text-white">Terms</a>
            <a href="/legal/privacy-policy" className="text-slate-400 hover:text-white">Privacy Policy</a>
            <a href="/help" className="text-slate-400 hover:text-white">Help Centre</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
