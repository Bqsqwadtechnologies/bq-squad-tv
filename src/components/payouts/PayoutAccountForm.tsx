import { FormDiscardButton } from "@/components/FormDiscardButton";
import React, { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, Lock, ShieldAlert, UploadCloud, FileText, Check } from "lucide-react";
import { AccountType, PayoutProfileRecord } from "@/lib/server/payouts/types";
import { getBanksForCountry, validateNuban, validateIban } from "@/lib/server/payouts/bank-directory";

interface PayoutAccountFormProps {
  countryCode: string;
  defaultCurrency: string;
  existingAccount?: PayoutProfileRecord | null;
  onSuccess?: (account: any) => void;
  getAuthHeaders?: () => Promise<Record<string, string>>;
}

export function PayoutAccountForm({
  countryCode,
  defaultCurrency,
  existingAccount,
  onSuccess,
  getAuthHeaders,
}: PayoutAccountFormProps) {
  const availableBanks = getBanksForCountry(countryCode);
  const isNigeria = countryCode.toUpperCase() === "NG";

  const [bankName, setBankName] = useState(existingAccount?.bankName || (availableBanks[0]?.name ?? ""));
  const [bankAddress, setBankAddress] = useState(
    existingAccount?.bankAddress || (availableBanks[0]?.address ?? "")
  );
  const [isManualBank, setIsManualBank] = useState(existingAccount?.isManualBank || false);
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [iban, setIban] = useState(existingAccount?.iban || "");
  const [beneficiaryName, setBeneficiaryName] = useState(existingAccount?.beneficiaryName || "");
  const [beneficiaryAddress, setBeneficiaryAddress] = useState(existingAccount?.beneficiaryAddress || "");
  const [accountType, setAccountType] = useState<AccountType>(existingAccount?.accountType || "checking");
  const [currency, setCurrency] = useState(existingAccount?.currency || defaultCurrency);
  const [swiftBic, setSwiftBic] = useState(existingAccount?.swiftBic || (availableBanks[0]?.swiftBic ?? ""));
  const [routingCode, setRoutingCode] = useState(existingAccount?.routingCode || "");
  const [purposeOfPayment, setPurposeOfPayment] = useState(
    existingAccount?.purposeOfPayment || "Platform content licensing earnings settlement"
  );
  const [confirmCertified, setConfirmCertified] = useState(false);

  // Proof of account document
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofFileName, setProofFileName] = useState<string>(existingAccount?.proofDocumentFileName || "");
  const [proofPath, setProofPath] = useState<string>(existingAccount?.proofDocumentPath || "");

  // Change request unlock for locked accounts
  const [requestingChange, setRequestingChange] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-sync bank address & swift when selection changes
  const handleBankChange = (name: string) => {
    setBankName(name);
    const found = availableBanks.find((b) => b.name === name);
    if (found) {
      setBankAddress(found.address);
      setSwiftBic(found.swiftBic);
    }
  };

  const isLocked = Boolean(existingAccount?.isLocked && !requestingChange);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (isLocked) {
      setError("This payout account is locked. Request an account update first.");
      return;
    }

    if (!confirmCertified) {
      setError("You must certify that you are the legal and authorized owner of this bank account.");
      return;
    }

    if (!accountNumber) {
      setError("Account number is required.");
      return;
    }

    if (accountNumber !== confirmAccountNumber) {
      setError("Account numbers do not match. Please verify.");
      return;
    }

    // Require proof of account
    if (!proofFile && !proofPath) {
      setError("A recent bank statement or proof-of-account document is required for verification.");
      return;
    }

    if (isNigeria && !validateNuban(accountNumber)) {
      setError("Nigerian bank account number must be exactly 10 digits (NUBAN format).");
      return;
    }

    if (iban && !validateIban(iban)) {
      setError("The provided IBAN checksum or format is invalid.");
      return;
    }

    setLoading(true);
    try {
      const headers = getAuthHeaders ? await getAuthHeaders() : {};

      // 1. Upload proof file if user attached a new file
      let finalProofPath = proofPath;
      let finalProofFileName = proofFileName;

      if (proofFile) {
        const formData = new FormData();
        formData.append("file", proofFile);
        const uploadRes = await fetch("/api/public/v1/producer/payout-proof-upload", {
          method: "POST",
          headers: {
            ...(headers["authorization"] ? { authorization: headers["authorization"] } : {}),
            ...(headers["x-firebase-auth"] ? { "x-firebase-auth": headers["x-firebase-auth"] } : {}),
          },
          body: formData,
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to upload proof document.");
        }

        const uploadJson = await uploadRes.json();
        finalProofPath = uploadJson.proofDocumentPath;
        finalProofFileName = uploadJson.proofDocumentFileName;
      }

      // 2. Submit payout account profile
      const res = await fetch("/api/public/v1/producer/payout-profile", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bankName,
          bankAddress,
          isManualBank,
          accountNumber,
          confirmAccountNumber,
          iban: iban || undefined,
          beneficiaryName,
          beneficiaryAddress,
          accountType,
          currency,
          swiftBic,
          routingCode: routingCode || undefined,
          purposeOfPayment,
          proofDocumentPath: finalProofPath,
          proofDocumentFileName: finalProofFileName,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save payout profile.");
      }

      const data = await res.json();
      setSuccess("Payout account submitted for verification. Payouts are safely paused while under review.");
      setRequestingChange(false);
      setProofPath(finalProofPath);
      setProofFileName(finalProofFileName);
      setProofFile(null);
      if (onSuccess) {
        onSuccess(data.profile);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Official Payout Bank Account</span>
            {isLocked && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-xs text-emerald-400">
                <Lock className="h-3 w-3" /> Locked & Verified
              </span>
            )}
            {existingAccount?.verificationStatus === "pending" && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-xs text-amber-300">
                Pending Compliance Review
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400">
            Designated institutional bank account for direct bank wire transfer settlements. Minimum payout is $500. Locked to Verified Residence ({countryCode.toUpperCase()}).
          </p>
        </div>

        {isLocked && (
          <button
            type="button"
            onClick={() => setRequestingChange(true)}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition"
          >
            Update Bank Details
          </button>
        )}
      </div>

      {/* Calm Trust Notice Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3.5 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-400" />
          <span>Your information is encrypted and protected. We use it only to verify your identity and to pay you.</span>
        </div>
        <a
          href="/help/data-protection"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 font-semibold text-cyan-300 hover:text-cyan-200 underline text-xs"
        >
          Learn more
        </a>
      </div>

      {isLocked && !requestingChange ? (
        <div className="space-y-4 text-xs">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
            <h4 className="font-semibold text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Verified Payout Profile
            </h4>
            <div className="grid grid-cols-2 gap-2 mt-2 text-slate-300">
              <div><span className="text-slate-500">Beneficiary:</span> {existingAccount?.beneficiaryName}</div>
              <div><span className="text-slate-500">Bank:</span> {existingAccount?.bankName} ({existingAccount?.bankCountry})</div>
              <div><span className="text-slate-500">Account:</span> {existingAccount?.accountNumberMasked}</div>
              <div><span className="text-slate-500">Currency:</span> {existingAccount?.currency}</div>
            </div>
          </div>
          <p className="text-slate-400">
            To prevent unauthorized account takeovers, your bank details are locked. Modifying your banking details requires compliance re-review and will pause payouts until verified.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {requestingChange && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>
                You are updating your verified payout account. Payouts will be held pending verification of your new banking proof.
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Beneficiary Name & Address */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">
                Account Holder / Beneficiary Name *
              </label>
              <input
                type="text"
                required
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                placeholder="Exact legal or registered business name"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500">
                Must match your verified KYC legal identity.
              </span>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">
                Beneficiary Physical Address *
              </label>
              <input
                type="text"
                required
                value={beneficiaryAddress}
                onChange={(e) => setBeneficiaryAddress(e.target.value)}
                placeholder="Street address, city, postal code"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Bank Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">Bank Name *</label>
              {availableBanks.length > 0 && !isManualBank ? (
                <div className="space-y-2">
                  <select
                    value={bankName}
                    onChange={(e) => handleBankChange(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {availableBanks.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name} ({b.swiftBic})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsManualBank(true)}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300"
                  >
                    Bank not listed? Enter bank details manually
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    required
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Full licensed institutional bank name"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                  {availableBanks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsManualBank(false)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300"
                    >
                      Choose from registered {countryCode.toUpperCase()} bank directory
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">Bank SWIFT / BIC *</label>
              <input
                type="text"
                required
                value={swiftBic}
                onChange={(e) => setSwiftBic(e.target.value.toUpperCase())}
                placeholder="e.g. FBNINGLAXXX"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Account Number & Confirmation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">
                {isNigeria ? "NUBAN Account Number (10 digits) *" : "Account Number *"}
              </label>
              <input
                type="text"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.trim())}
                placeholder={isNigeria ? "0123456789" : "Account number"}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">
                Confirm Account Number *
              </label>
              <input
                type="text"
                required
                value={confirmAccountNumber}
                onChange={(e) => setConfirmAccountNumber(e.target.value.trim())}
                placeholder="Re-enter to confirm account digits"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* IBAN & Currency */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300">
                IBAN (International Bank Account Number)
              </label>
              <input
                type="text"
                value={iban}
                onChange={(e) => setIban(e.target.value.replace(/\s+/g, "").toUpperCase())}
                placeholder="e.g. GB89WEST12345698765432"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500">
                Required for European and international wire settlements.
              </span>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">Settlement Currency *</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="NGN">NGN - Nigerian Naira</option>
                <option value="KES">KES - Kenyan Shilling</option>
                <option value="ZAR">ZAR - South African Rand</option>
                <option value="GHS">GHS - Ghanaian Cedi</option>
                <option value="CAD">CAD - Canadian Dollar</option>
              </select>
            </div>
          </div>

          {/* Proof of Account Upload */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
            <label className="block text-xs font-semibold text-slate-200">
              Proof of Bank Account Document *
            </label>
            <p className="text-[11px] text-slate-400">
              Upload a recent bank statement (issued within 3 months) or official bank verification letter showing the account holder name, account number/IBAN, bank name, and branch address. PDF, JPEG, PNG, WEBP (Max 10MB).
            </p>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-dashed border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 cursor-pointer transition">
                <UploadCloud className="h-4 w-4" />
                <span>{proofFile ? "Change Document" : "Select Bank Statement"}</span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setProofFile(f);
                      setProofFileName(f.name);
                    }
                  }}
                />
              </label>

              {(proofFile || proofFileName) && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <FileText className="h-4 w-4" />
                  <span className="font-mono text-white">{proofFileName || proofFile?.name}</span>
                  <Check className="h-3 w-3 text-emerald-400" />
                </div>
              )}
            </div>
          </div>

          {/* Certification Checkbox */}
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 flex items-start gap-3">
            <input
              type="checkbox"
              id="confirmCertified"
              checked={confirmCertified}
              onChange={(e) => setConfirmCertified(e.target.checked)}
              className="mt-0.5 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-0"
            />
            <label htmlFor="confirmCertified" className="text-xs text-slate-300 cursor-pointer leading-relaxed">
              I certify under penalty of perjury that I am the verified account holder or authorized corporate signatory for this account, that all information provided is accurate, and that payouts to this account are for legitimate licensing distributions.
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <FormDiscardButton
              label="Discard Changes"
              onDiscard={() => {
                if (requestingChange) setRequestingChange(false);
                setAccountNumber("");
                setConfirmAccountNumber("");
                setBeneficiaryName("");
                setBeneficiaryAddress("");
              }}
            />
            {requestingChange && (
              <button
                type="button"
                onClick={() => setRequestingChange(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-300 hover:bg-white/10 transition"
              >
                Cancel Update
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-cyan-500 px-5 py-2 text-xs font-bold text-black hover:bg-cyan-400 transition flex items-center gap-2"
            >
              {loading ? "Submitting for Verification..." : "Save Payout Account"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
