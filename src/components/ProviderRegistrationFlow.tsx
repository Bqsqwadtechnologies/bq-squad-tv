import React, { useState, type FormEvent } from "react";
import { ALL_COUNTRIES } from "../lib/kyc-country-rules";
import {
  AlertCircle,
  Building,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  FileCheck,
  FileText,
  Globe,
  HardDrive,
  Key,
  Layers,
  Lock,
  Radio,
  Send,
  ShieldCheck,
  Tv,
} from "lucide-react";

export type SandboxCredentials = {
  rtmpIngestUrl: string;
  streamKey: string;
  srtUrl: string;
  issuedAt: string;
  status: string;
};

export interface ProviderRegistrationFlowProps {
  onSuccess?: (providerId: string) => void;
  initialStatus?: "unregistered" | "pending_approval" | "active";
  initialSandboxCredentials?: SandboxCredentials | null;
  submitRegistration: (formData: Record<string, any>) => Promise<{
    providerId: string;
    sandboxCredentials: SandboxCredentials;
    estimatedReviewTime: string;
  }>;
}

export function ProviderRegistrationFlow({
  onSuccess,
  initialStatus = "unregistered",
  initialSandboxCredentials = null,
  submitRegistration,
}: ProviderRegistrationFlowProps) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(
    initialStatus === "pending_approval" || Boolean(initialSandboxCredentials),
  );
  const [sandboxCreds, setSandboxCreds] = useState<SandboxCredentials | null>(
    initialSandboxCredentials,
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Company info
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [website, setWebsite] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Step 2: Legal & tax
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [taxId, setTaxId] = useState("");
  const [registeredAddress, setRegisteredAddress] = useState("");
  const [legalEntityType, setLegalEntityType] = useState("Limited Liability Company");

  // Step 3: Ingest technical profile
  const [primaryProtocol, setPrimaryProtocol] = useState("RTMP");
  const [estimatedBitrateMbps, setEstimatedBitrateMbps] = useState(6.0);
  const [targetResolution, setTargetResolution] = useState("1080p60");
  const [backupRedundancy, setBackupRedundancy] = useState(true);

  // Step 4: Settlement bank account
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [swiftBic, setSwiftBic] = useState("");
  const [settlementCurrency, setSettlementCurrency] = useState("USD");

  // Step 5: Master agreement e-signature
  const [eSignatureName, setESignatureName] = useState("");
  const [signerTitle, setSignerTitle] = useState("Authorized Officer");
  const [agreedTerms, setAgreedTerms] = useState(false);

  function copyToClipboard(text: string, label: string) {
    if (navigator?.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2500);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreedTerms || !eSignatureName.trim()) {
      setError("Please sign the master distribution agreement to proceed.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = {
        name: companyName,
        country,
        website,
        contactEmail,
        contactPhone,
        registrationNumber,
        taxId,
        registeredAddress,
        legalEntityType,
        primaryProtocol,
        estimatedBitrateMbps,
        targetResolution,
        backupRedundancy,
        bankName,
        accountNumber,
        accountName,
        swiftBic,
        settlementCurrency,
        eSignatureName,
        signerTitle,
        agreementAgreedAt: new Date().toISOString(),
      };

      const result = await submitRegistration(payload);
      setSandboxCreds(result.sandboxCredentials);
      setIsSubmitted(true);
      if (onSuccess) {
        onSuccess(result.providerId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit partner registration.");
    } finally {
      setBusy(false);
    }
  }

  // If already submitted, show the Onboarding Checklist & Sandbox Credentials
  if (isSubmitted) {
    return (
      <div className="space-y-6">
        {/* Banner: Status and estimated review time */}
        <div className="rounded-3xl border border-amber-500/30 bg-[#0c1a40] p-6 sm:p-8 shadow-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Clock className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Partner Registration Under Review
                </h3>
                <p className="text-xs text-slate-300">
                  Estimated review duration:{" "}
                  <strong className="text-amber-400">24-48 hours</strong>
                </p>
              </div>
            </div>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300">
              Pending Operations Approval
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Your partner distribution agreement and technical profile have been recorded. While our
            legal and operations desk completes KYC verification, you can immediately begin
            verifying your ingest pipeline using your sandbox credentials below.
          </p>
        </div>

        {/* Sandbox Ingest Testing Credentials Card */}
        {sandboxCreds && (
          <div className="rounded-3xl border border-cyan-400/30 bg-[#07143d] p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Radio className="h-5 w-5 text-cyan-400" />
                <h4 className="text-base font-bold text-white">
                  Sandbox Ingest Testing Credentials
                </h4>
              </div>
              <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                Active Sandbox
              </span>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="rounded-2xl border border-white/10 bg-[#030b2a] p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400">
                    Primary RTMP Ingest Endpoint
                  </span>
                  <button
                    onClick={() => copyToClipboard(sandboxCreds.rtmpIngestUrl, "rtmp")}
                    className="flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    {copiedKey === "rtmp" ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>{copiedKey === "rtmp" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-cyan-300 break-all">{sandboxCreds.rtmpIngestUrl}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#030b2a] p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400">
                    Sandbox Stream Key
                  </span>
                  <button
                    onClick={() => copyToClipboard(sandboxCreds.streamKey, "key")}
                    className="flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    {copiedKey === "key" ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>{copiedKey === "key" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-emerald-400 break-all">{sandboxCreds.streamKey}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#030b2a] p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400">
                    Ultra-Low Latency SRT Ingest URL
                  </span>
                  <button
                    onClick={() => copyToClipboard(sandboxCreds.srtUrl, "srt")}
                    className="flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    {copiedKey === "srt" ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>{copiedKey === "srt" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-cyan-300 break-all">{sandboxCreds.srtUrl}</p>
              </div>
            </div>
          </div>
        )}

        {/* Onboarding Checklist */}
        <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 sm:p-8 shadow-xl space-y-5">
          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-cyan-400" />
            Partner Onboarding Checklist
          </h4>

          <div className="space-y-3">
            {[
              {
                title: "1. Corporate & Legal Verification",
                detail: "Corporate charter, entity registration, and tax ID received.",
                status: "done",
              },
              {
                title: "2. Master Distribution Agreement Signed",
                detail: "Cryptographic e-signature stored with timestamp certificate.",
                status: "done",
              },
              {
                title: "3. Ingest Technical Profile & Sandbox Issued",
                detail: "Sandbox endpoints active for 1080p60 stream validation.",
                status: "done",
              },
              {
                title: "4. Operations Compliance Review",
                detail: "Background review in progress. Typical turnaround: 24 to 48 hours.",
                status: "active",
              },
              {
                title: "5. Production Edge Ingest Provisioning",
                detail: "Multi-region CDN deployment will activate upon final approval.",
                status: "pending",
              },
            ].map((step, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3.5 rounded-2xl border p-4 text-xs transition ${
                  step.status === "done"
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : step.status === "active"
                      ? "border-cyan-400/30 bg-cyan-500/10"
                      : "border-white/5 bg-[#030b2a] opacity-60"
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {step.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : step.status === "active" ? (
                    <Clock className="h-4 w-4 text-cyan-400 animate-spin" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-slate-600" />
                  )}
                </div>
                <div>
                  <h5 className="font-bold text-white">{step.title}</h5>
                  <p className="text-[11px] text-slate-400 mt-0.5">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 5-STEP STEPPER FORM
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Stepper Progress Bar */}
      <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl">
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
          {[
            { step: 1, label: "Company Info", icon: Building },
            { step: 2, label: "Legal & Tax", icon: FileText },
            { step: 3, label: "Technical Profile", icon: Radio },
            { step: 4, label: "Settlement Account", icon: CreditCard },
            { step: 5, label: "E-Signature", icon: ShieldCheck },
          ].map((s) => {
            const Icon = s.icon;
            const isPassed = currentStep > s.step;
            const isCurrent = currentStep === s.step;
            return (
              <div
                key={s.step}
                onClick={() => {
                  if (isPassed) setCurrentStep(s.step);
                }}
                className={`flex items-center gap-2 shrink-0 cursor-pointer transition ${
                  isCurrent
                    ? "text-cyan-400 font-bold"
                    : isPassed
                      ? "text-emerald-400"
                      : "text-slate-500"
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold border transition ${
                    isCurrent
                      ? "border-cyan-400 bg-cyan-400/20 text-cyan-300"
                      : isPassed
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                        : "border-white/10 bg-white/5 text-slate-500"
                  }`}
                >
                  {isPassed ? <Check className="h-4 w-4" /> : s.step}
                </div>
                <span className="hidden sm:inline text-xs font-medium">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Content */}
      <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 sm:p-8 shadow-2xl space-y-6">
        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 text-xs">
          {/* STEP 1: COMPANY INFO */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Building className="h-5 w-5 text-cyan-400" />
                  Step 1: Company & Entity Information
                </h3>
                <p className="text-slate-400 text-xs">
                  Provide your organization details for distribution licensing
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">
                  Company / Organization Name
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Apex Global Broadcast Networks Ltd"
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Country of Incorporation
                  </label>
                  <select
                    required
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                  >
                    {ALL_COUNTRIES.map((entry) => (
                      <option key={entry.code} value={entry.name}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Official Website
                  </label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Operations Contact Email
                  </label>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="ops@example.com"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Direct Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+234 800 000 0000"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (!companyName.trim()) {
                      setError("Please provide your company name.");
                      return;
                    }
                    setError("");
                    setCurrentStep(2);
                  }}
                  className="rounded-xl bg-cyan-400 px-6 py-2.5 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-md shadow-cyan-400/20"
                >
                  Continue to Legal & Tax →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: LEGAL & TAX */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-cyan-400" />
                  Step 2: Legal & Tax Registration
                </h3>
                <p className="text-slate-400 text-xs">
                  Required for revenue disbursement tax compliance
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Corporate Registration (RC / Reg No.)
                  </label>
                  <input
                    type="text"
                    required
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    placeholder="e.g. RC-1928471"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Tax Identification Number (TIN / VAT)
                  </label>
                  <input
                    type="text"
                    required
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="e.g. 29103847-0001"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">
                  Registered Legal Address
                </label>
                <textarea
                  required
                  rows={3}
                  value={registeredAddress}
                  onChange={(e) => setRegisteredAddress(e.target.value)}
                  placeholder="Street address, city, state/province, postal code"
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">
                  Entity Legal Form
                </label>
                <select
                  value={legalEntityType}
                  onChange={(e) => setLegalEntityType(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                >
                  <option value="Limited Liability Company">Limited Liability Company (LLC / Ltd)</option>
                  <option value="Public Corporation">Public Corporation (PLC / Corp)</option>
                  <option value="Broadcast Broadcaster Licensee">Licensed Broadcaster</option>
                  <option value="Partnership">Partnership</option>
                </select>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="rounded-xl border border-white/10 px-5 py-2 text-slate-400 hover:text-white"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setCurrentStep(3);
                  }}
                  className="rounded-xl bg-cyan-400 px-6 py-2.5 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-md shadow-cyan-400/20"
                >
                  Continue to Ingest Profile →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: INGEST TECHNICAL PROFILE */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Radio className="h-5 w-5 text-cyan-400" />
                  Step 3: Ingest Technical Profile
                </h3>
                <p className="text-slate-400 text-xs">
                  Configure your contribution encoding and distribution stream requirements
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Primary Contribution Protocol
                  </label>
                  <select
                    value={primaryProtocol}
                    onChange={(e) => setPrimaryProtocol(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                  >
                    <option value="RTMP">RTMP / RTMPS (Standard Stream)</option>
                    <option value="SRT">SRT (Secure Reliable Transport - Low Latency)</option>
                    <option value="HLS-PULL">HLS Source Pull (CDN Ingest)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Target Broadcast Resolution
                  </label>
                  <select
                    value={targetResolution}
                    onChange={(e) => setTargetResolution(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                  >
                    <option value="1080p60">1080p60 Full HD (60 FPS)</option>
                    <option value="1080p30">1080p30 Full HD (30 FPS)</option>
                    <option value="720p60">720p60 HD</option>
                    <option value="4K">4K Ultra HD (2160p)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">
                  Estimated Bitrate (Mbps): <span className="text-cyan-300">{estimatedBitrateMbps} Mbps</span>
                </label>
                <input
                  type="range"
                  min="2"
                  max="25"
                  step="0.5"
                  value={estimatedBitrateMbps}
                  onChange={(e) => setEstimatedBitrateMbps(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-white/5 bg-[#030b2a] p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupRedundancy}
                  onChange={(e) => setBackupRedundancy(e.target.checked)}
                  className="h-4 w-4 rounded accent-cyan-400"
                />
                <div>
                  <span className="font-bold text-white block">Dual Ingest Redundancy</span>
                  <span className="text-[11px] text-slate-400">
                    Provision secondary backup edge ingest node for hot failover
                  </span>
                </div>
              </label>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="rounded-xl border border-white/10 px-5 py-2 text-slate-400 hover:text-white"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setCurrentStep(4);
                  }}
                  className="rounded-xl bg-cyan-400 px-6 py-2.5 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-md shadow-cyan-400/20"
                >
                  Continue to Settlement Account →
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: SETTLEMENT BANK ACCOUNT */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-cyan-400" />
                  Step 4: Settlement Bank Account
                </h3>
                <p className="text-slate-400 text-xs">
                  Account for monthly net revenue disbursement
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    required
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. Zenith Bank / Standard Chartered"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Settlement Currency
                  </label>
                  <select
                    value={settlementCurrency}
                    onChange={(e) => setSettlementCurrency(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white font-mono"
                  >
                    <option value="USD">USD — US Dollar (International SWIFT)</option>
                    <option value="NGN">NGN — Nigerian Naira (Direct NIBSS)</option>
                    <option value="EUR">EUR — Euro (SEPA Wire)</option>
                    <option value="GBP">GBP — British Pound</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Account Number / IBAN
                  </label>
                  <input
                    type="text"
                    required
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="e.g. 1012938472"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Account Beneficiary Name
                  </label>
                  <input
                    type="text"
                    required
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. Apex Global Broadcast Networks Ltd"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">
                  SWIFT / BIC Code (For USD / International)
                </label>
                <input
                  type="text"
                  value={swiftBic}
                  onChange={(e) => setSwiftBic(e.target.value)}
                  placeholder="e.g. ZEIBNGLA"
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white font-mono"
                />
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="rounded-xl border border-white/10 px-5 py-2 text-slate-400 hover:text-white"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setCurrentStep(5);
                  }}
                  className="rounded-xl bg-cyan-400 px-6 py-2.5 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-md shadow-cyan-400/20"
                >
                  Continue to Agreement E-Signature →
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: MASTER AGREEMENT E-SIGNATURE */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-cyan-400" />
                  Step 5: Master Distribution Agreement E-Signature
                </h3>
                <p className="text-slate-400 text-xs">
                  Review terms and execute binding digital signature
                </p>
              </div>

              {/* Agreement summary box */}
              <div className="max-h-48 overflow-y-auto rounded-2xl border border-white/10 bg-[#030b2a] p-4 text-[11px] text-slate-300 space-y-2 leading-relaxed">
                <p className="font-bold text-white">MASTER CHANNEL DISTRIBUTION AGREEMENT SUMMARY</p>
                <p>
                  1. Revenue Settlement: Partner receives 25.0% (2,500 bps) of net profit generated
                  from live broadcast watch-time pool.
                </p>
                <p>
                  2. Telemetry and Deductible Costs: CDN edge egress and transcoding costs are audited
                  and deducted as contracted prior to profit split.
                </p>
                <p>
                  3. SLA & Availability: Partner guarantees 99.98% stream ingest availability.
                  Disputes are submitted through the portal and resolved under binding SLA terms.
                </p>
                <p>
                  4. Intellectual Property: Partner certifies full copyright and broadcast transmission
                  licensing for all ingested feeds.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Authorized Signatory Full Legal Name
                  </label>
                  <input
                    type="text"
                    required
                    value={eSignatureName}
                    onChange={(e) => setESignatureName(e.target.value)}
                    placeholder="e.g. Adebayo Ogunlesi"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">
                    Signatory Corporate Title
                  </label>
                  <input
                    type="text"
                    required
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                    placeholder="e.g. Chief Executive Officer / Managing Director"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white"
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded accent-cyan-400"
                />
                <div className="text-[11px] text-slate-200 leading-snug">
                  I hereby confirm that I am an authorized corporate officer and legally execute this
                  Master Channel Distribution Agreement on behalf of the registered entity.
                </div>
              </label>

              <div className="flex justify-between pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="rounded-xl border border-white/10 px-5 py-2 text-slate-400 hover:text-white"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={busy || !agreedTerms || !eSignatureName.trim()}
                  className="rounded-xl bg-cyan-400 px-8 py-3 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-lg shadow-cyan-400/25 disabled:opacity-50"
                >
                  {busy ? "Submitting Application…" : "Submit Partner Application"}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
