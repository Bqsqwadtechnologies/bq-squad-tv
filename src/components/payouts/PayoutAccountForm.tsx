import React, { useState, useEffect } from "react";
import { Shield, Building2, HelpCircle, CheckCircle2, AlertCircle, Lock } from "lucide-react";
import { getBanksForCountry, BankDirectoryEntry, validateIban, validateNuban } from "@/lib/server/payouts/bank-directory";

interface PayoutAccountFormProps {
  kycCountry: string;
  beneficiaryName: string;
  beneficiaryAddress: string;
  onSaved?: () => void;
  className?: string;
}

export const PayoutAccountForm: React.FC<PayoutAccountFormProps> = ({
  kycCountry = "NG",
  beneficiaryName,
  beneficiaryAddress,
  onSaved,
  className = "",
}) => {
  const [banks, setBanks] = useState<BankDirectoryEntry[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [isManualBank, setIsManualBank] = useState<boolean>(false);
  const [manualBankName, setManualBankName] = useState<string>("");
  const [manualBankAddress, setManualBankAddress] = useState<string>("");
  const [manualSwiftBic, setManualSwiftBic] = useState<string>("");
  const [manualRoutingCode, setManualRoutingCode] = useState<string>("");

  const [accountNumber, setAccountNumber] = useState<string>("");
  const [accountNumberConfirm, setAccountNumberConfirm] = useState<string>("");
  const [iban, setIban] = useState<string>("");
  const [accountType, setAccountType] = useState<"checking" | "savings" | "current">("checking");
  const [purposeOfPayment, setPurposeOfPayment] = useState<string>("streaming_royalties");

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savedMaskedAccount, setSavedMaskedAccount] = useState<string | null>(null);

  const countryUpper = kycCountry.toUpperCase();
  const defaultCurrency = countryUpper === "NG" ? "NGN" : "USD";

  useEffect(() => {
    const list = getBanksForCountry(countryUpper);
    setBanks(list);
    if (list.length > 0 && !selectedBankId) {
      setSelectedBankId(list[0].id);
    }
  }, [countryUpper]);

  const selectedBank = banks.find((b) => b.id === selectedBankId);

  // Active bank details (either detected from directory or manually specified)
  const bankName = isManualBank ? manualBankName : (selectedBank?.name || "");
  const bankAddress = isManualBank ? manualBankAddress : (selectedBank?.address || "");
  const swiftBic = isManualBank ? manualSwiftBic : (selectedBank?.swiftBic || "");
  const routingCode = isManualBank ? manualRoutingCode : (selectedBank?.routingCode || "");

  const handleBankChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "__custom__") {
      setIsManualBank(true);
      setSelectedBankId("__custom__");
    } else {
      setIsManualBank(false);
      setSelectedBankId(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (accountNumber !== accountNumberConfirm) {
      setErrorMessage("Account numbers do not match. Please verify both fields.");
      return;
    }

    if (countryUpper === "NG") {
      const nuban = validateNuban(accountNumber);
      if (!nuban.valid) {
        setErrorMessage(nuban.error || "Please enter a valid 10-digit Nigerian account number.");
        return;
      }
    }

    if (iban) {
      const ibanRes = validateIban(iban, countryUpper);
      if (!ibanRes.valid) {
        setErrorMessage(ibanRes.error || "Please verify your IBAN.");
        return;
      }
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/public/v1/producer/payout-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId: isManualBank ? undefined : selectedBankId,
          bankName,
          bankCountry: countryUpper,
          bankAddress: bankAddress || "Primary Headquarters",
          accountNumber,
          accountNumberConfirm,
          iban: iban || null,
          accountType,
          swiftBic: swiftBic || (countryUpper === "NG" ? "CBNGNGLA" : "WIREUS33"),
          routingCode: routingCode || null,
          purposeOfPayment,
          isManualBank,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || "Failed to save payout profile.");
      }

      setSuccessMessage("Payout bank account verified and securely saved.");
      setSavedMaskedAccount(data.accountNumberMasked || "****");
      if (onSaved) onSaved();
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`rounded-xl border border-border bg-card p-6 shadow-sm ${className}`}>
      {/* Header & Phase 1 Wording */}
      <div className="mb-6 flex flex-col gap-2 border-b border-border/60 pb-5">
        <div className="flex items-center gap-2 text-primary font-medium text-sm">
          <Building2 className="h-4 w-4" />
          <span>Payout Bank Wire Details</span>
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Bank Wire Transfer Account
        </h2>
        <div className="rounded-lg bg-muted/60 p-3.5 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">
            Minimum payout is $500. Payments are made by bank wire transfer.
          </p>
          <p className="mt-1 text-xs">
            Balances accumulate automatically until the minimum payout threshold is reached. Your payout account country is locked to your verified identity residence country.
          </p>
        </div>
      </div>

      {savedMaskedAccount && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Active payout profile verified</p>
            <p className="text-xs">Account: {savedMaskedAccount} ({defaultCurrency})</p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{errorMessage}</span>
        </div>
      )}

      {successMessage && !savedMaskedAccount && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="text-sm">{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Country Lock (Read-only) */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Bank Account Country (Locked to Verified Residence)
          </label>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-sm text-foreground">
            <span className="font-mono font-bold">{countryUpper}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Verified by identity profile
            </span>
          </div>
        </div>

        {/* Bank Selection */}
        <div>
          <label htmlFor="payout-bank" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Select Your Bank
          </label>
          <select
            id="payout-bank"
            value={selectedBankId}
            onChange={handleBankChange}
            className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
            <option value="__custom__">My bank is not listed...</option>
          </select>
        </div>

        {/* Manual Bank Fields if not in directory */}
        {isManualBank && (
          <div className="space-y-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-semibold">
              <AlertCircle className="h-4 w-4" />
              <span>Unlisted Bank — Will be queued for compliance review</span>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Bank Legal Name</label>
              <input
                type="text"
                required
                value={manualBankName}
                onChange={(e) => setManualBankName(e.target.value)}
                placeholder="Enter financial institution name"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Bank Head Office Address</label>
              <input
                type="text"
                required
                value={manualBankAddress}
                onChange={(e) => setManualBankAddress(e.target.value)}
                placeholder="Street address, city, state"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">SWIFT / BIC Code</label>
                <input
                  type="text"
                  required
                  value={manualSwiftBic}
                  onChange={(e) => setManualSwiftBic(e.target.value.toUpperCase())}
                  placeholder="8 or 11 characters"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Routing / Sort Code (Optional)</label>
                <input
                  type="text"
                  value={manualRoutingCode}
                  onChange={(e) => setManualRoutingCode(e.target.value)}
                  placeholder="Branch code"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Account Number & Confirm Account Number (No paste on confirm) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="account-number" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Account Number {countryUpper === "NG" ? "(10-digit NUBAN)" : ""}
            </label>
            <input
              id="account-number"
              type="text"
              required
              autoComplete="off"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.trim())}
              placeholder={countryUpper === "NG" ? "0123456789" : "Account or IBAN"}
              className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="account-number-confirm" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Confirm Account Number
            </label>
            <input
              id="account-number-confirm"
              type="text"
              required
              autoComplete="off"
              onPaste={(e) => {
                e.preventDefault();
                setErrorMessage("Pasting into the confirmation field is disabled. Please type your account number.");
              }}
              value={accountNumberConfirm}
              onChange={(e) => setAccountNumberConfirm(e.target.value.trim())}
              placeholder="Re-type account number"
              className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-[11px] text-muted-foreground mt-1 block">
              Type twice to confirm. Pasting is disabled for payment safety.
            </span>
          </div>
        </div>

        {/* Optional IBAN for international accounts */}
        {countryUpper !== "NG" && (
          <div>
            <label htmlFor="iban-field" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              IBAN (If issued by your bank)
            </label>
            <input
              id="iban-field"
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase())}
              placeholder={`${countryUpper}00 ...`}
              className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary uppercase"
            />
          </div>
        )}

        {/* Auto-Detected Read-Only Fields */}
        <div className="rounded-lg border border-border/80 bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Detected Bank Wire Details
            </span>
            <a
              href="mailto:support@bqsquad.tv?subject=Detected%20bank%20details%20correction"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Detected details look wrong? Tell us
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground block">Beneficiary Legal Name:</span>
              <span className="font-semibold text-foreground">{beneficiaryName || "Pre-filled from KYC"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Settlement Currency:</span>
              <span className="font-semibold text-foreground">{defaultCurrency}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">SWIFT / BIC:</span>
              <span className="font-mono font-semibold text-foreground">{swiftBic || "Auto-assigned"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Bank Branch / Head Office:</span>
              <span className="text-foreground truncate block">{bankAddress || "Headquarters"}</span>
            </div>
          </div>
        </div>

        {/* Trust & Encryption Banner */}
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
          <Shield className="h-4 w-4 shrink-0 text-primary" />
          <span>
            Your information is encrypted and protected. We use it only to verify your identity and to pay you.
          </span>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isLoading ? "Validating Bank Account..." : "Save Payout Bank Account"}
        </button>
      </form>
    </div>
  );
};
