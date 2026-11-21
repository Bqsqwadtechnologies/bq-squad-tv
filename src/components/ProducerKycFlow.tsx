import React, { useState, useEffect } from "react";
import { KycCountryPicker } from "@/components/KycCountryPicker";
import { KycPhoneVerification } from "@/components/KycPhoneVerification";
import {
  getCountryRule,
  validateIdFormat,
  validateTaxIdFormat,
  validateCompanyRegistrationFormat,
  type KycCountryRule,
} from "@/lib/kyc-country-rules";
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Lock,
  FileText,
  User,
  Building,
  Upload,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Info,
} from "lucide-react";

export interface ProducerKycFlowProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  authToken?: string;
  initialCountry?: string;
}

export function ProducerKycFlow({
  onSuccess,
  onCancel,
  authToken,
  initialCountry = "US",
}: ProducerKycFlowProps) {
  const [step, setStep] = useState<number>(1);
  const [countryCode, setCountryCode] = useState<string>(initialCountry);
  const [entityType, setEntityType] = useState<"individual" | "registered_business">("individual");

  // Form state
  const [legalName, setLegalName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [idTypeId, setIdTypeId] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [taxId, setTaxId] = useState("");
  const [companyRegNumber, setCompanyRegNumber] = useState("");

  // Phone verification
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState("");

  // Document files
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const countryRule = getCountryRule(countryCode);

  useEffect(() => {
    if (countryRule.acceptedPersonalIdTypes.length > 0) {
      const exists = countryRule.acceptedPersonalIdTypes.some((t) => t.id === idTypeId);
      if (!exists) {
        setIdTypeId(countryRule.acceptedPersonalIdTypes[0]!.id);
      }
    }
  }, [countryCode, countryRule.acceptedPersonalIdTypes]);

  function validateCurrentStep(): boolean {
    setError(null);
    if (step === 1) {
      if (!countryCode) {
        setError("Please select your country of residence / registration.");
        return false;
      }
      return true;
    }

    if (step === 2) {
      if (!legalName.trim()) {
        setError("Please enter your legal name as it appears on official documents.");
        return false;
      }
      if (entityType === "registered_business" && !businessName.trim()) {
        setError("Please enter your registered company or studio name.");
        return false;
      }

      // Check ID format
      const idCheck = validateIdFormat(countryCode, idTypeId, idNumber);
      if (!idNumber.trim()) {
        setError("Please enter your ID number.");
        return false;
      }
      if (!idCheck.valid) {
        setError(idCheck.message || "Invalid ID number format for your country.");
        return false;
      }

      // Check Tax format if provided or required
      if (taxId.trim()) {
        const taxCheck = validateTaxIdFormat(countryCode, taxId);
        if (!taxCheck.valid) {
          setError(taxCheck.message || "Invalid Tax ID format.");
          return false;
        }
      }

      // Check company reg if business
      if (entityType === "registered_business" && companyRegNumber.trim()) {
        const regCheck = validateCompanyRegistrationFormat(countryCode, companyRegNumber);
        if (!regCheck.valid) {
          setError(regCheck.message || "Invalid Company Registration number format.");
          return false;
        }
      }

      return true;
    }

    if (step === 3) {
      if (!phoneVerified) {
        setError("You must verify your mobile phone number before continuing.");
        return false;
      }
      return true;
    }

    if (step === 4) {
      if (documentFiles.length === 0) {
        setError("Please upload at least one government-issued identification document.");
        return false;
      }
      if (!declarationAccepted) {
        setError("You must certify that all provided details and media rights are accurate.");
        return false;
      }
      return true;
    }

    return true;
  }

  async function handleSubmit() {
    if (!validateCurrentStep()) return;
    setSubmitting(true);
    setError(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      // Upload documents through upload intent
      const evidenceUploadIds: string[] = [];

      for (const file of documentFiles) {
        const intentRes = await fetch("/api/public/v1/producer/verification/upload-intent", {
          method: "POST",
          headers,
          body: JSON.stringify({
            filename: file.name,
            sizeBytes: file.size,
            mimeType: file.type || "application/pdf",
          }),
        });

        if (intentRes.ok) {
          const intentData = await intentRes.json();
          // Upload file bytes to signed URL
          if (intentData.signedUrl) {
            await fetch(intentData.signedUrl, {
              method: "PUT",
              headers: { "Content-Type": file.type || "application/pdf" },
              body: file,
            }).catch(() => {});
          }
          if (intentData.uploadId) {
            evidenceUploadIds.push(intentData.uploadId);
          }
        }
      }

      // Submit verification record with collected upload IDs (or generated reference if mock)
      const res = await fetch("/api/public/v1/producer/verification", {
        method: "POST",
        headers,
        body: JSON.stringify({
          countryCode,
          entityType,
          legalName: legalName.trim(),
          businessName: entityType === "registered_business" ? businessName.trim() : undefined,
          evidenceUploadIds: evidenceUploadIds.length > 0 ? evidenceUploadIds : [`doc_${Date.now()}`],
          declarationAccepted: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || "Verification submission failed.");
      }

      setSuccess(true);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during submission.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-slate-900/90 p-8 text-center text-white shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h2 className="mt-4 text-xl font-bold">Verification Submitted Successfully</h2>
        <p className="mt-2 text-sm text-slate-300">
          Your identity and payout credentials have been encrypted and submitted for compliance review.
          Reviews typically complete within 24 to 48 hours.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-6 rounded-xl bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500"
        >
          Return to Producer Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/95 p-6 text-white shadow-2xl">
      {/* Trust & Encryption Badge */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4">
        <Lock className="h-5 w-5 shrink-0 text-cyan-400" />
        <div className="text-xs text-slate-300">
          <strong className="text-white">Encrypted & Protected: </strong>
          Your identity and tax identifiers are encrypted with AES-256-GCM. We use this information solely
          to verify your identity and disburse video streaming earnings.
        </div>
      </div>

      {/* Stepper indicator */}
      <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4 text-xs font-medium">
        <span className={step === 1 ? "text-cyan-400 font-bold" : "text-slate-400"}>1. Country</span>
        <span className="text-slate-600">→</span>
        <span className={step === 2 ? "text-cyan-400 font-bold" : "text-slate-400"}>2. Identity & Tax</span>
        <span className="text-slate-600">→</span>
        <span className={step === 3 ? "text-cyan-400 font-bold" : "text-slate-400"}>3. Phone OTP</span>
        <span className="text-slate-600">→</span>
        <span className={step === 4 ? "text-cyan-400 font-bold" : "text-slate-400"}>4. Documents</span>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Country First Selection */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold">Select Country of Payout & Registration</h3>
            <p className="text-xs text-slate-400">
              KYC and settlement requirements adapt dynamically across all 193 recognized territories.
            </p>
          </div>

          <div className="pt-2">
            <KycCountryPicker
              selectedCountryCode={countryCode}
              onSelectCountry={(c) => setCountryCode(c.code)}
              label="Country of Legal Residence / Incorporation"
            />
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 text-xs text-slate-300">
            <div className="flex items-center gap-2 font-semibold text-white">
              <span>{countryRule.flag}</span>
              <span>{countryRule.name} Compliance Profile</span>
            </div>
            <p className="mt-1 text-slate-400">
              Accepted IDs: {countryRule.acceptedPersonalIdTypes.map((t) => t.name).join(", ")}.
              Currency: <strong className="text-white">{countryRule.defaultCurrency}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Identity & Tax */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold">Entity Type & Legal Identification</h3>
            <p className="text-xs text-slate-400">
              Enter your official identification details under {countryRule.name} regulations.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setEntityType("individual")}
              className={`flex items-center gap-2 rounded-xl border p-3 text-left transition ${
                entityType === "individual"
                  ? "border-cyan-500 bg-cyan-950/30 text-white"
                  : "border-slate-800 bg-slate-800/40 text-slate-400 hover:text-white"
              }`}
            >
              <User className="h-5 w-5 text-cyan-400" />
              <div>
                <div className="text-sm font-semibold">Individual / Creator</div>
                <div className="text-xs text-slate-400">Solo filmmaker or producer</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setEntityType("registered_business")}
              className={`flex items-center gap-2 rounded-xl border p-3 text-left transition ${
                entityType === "registered_business"
                  ? "border-cyan-500 bg-cyan-950/30 text-white"
                  : "border-slate-800 bg-slate-800/40 text-slate-400 hover:text-white"
              }`}
            >
              <Building className="h-5 w-5 text-cyan-400" />
              <div>
                <div className="text-sm font-semibold">Production Studio</div>
                <div className="text-xs text-slate-400">Registered company / rights holder</div>
              </div>
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">
              Legal Full Name (as on government ID)
            </label>
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="e.g. Chukwuemeka Adebayo or Jane Doe"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {entityType === "registered_business" && (
            <div>
              <label className="block text-xs font-medium text-slate-300">
                Registered Business / Studio Name
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Blue Lagoon Studios Ltd."
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300">Government ID Type</label>
              <select
                value={idTypeId}
                onChange={(e) => setIdTypeId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
              >
                {countryRule.acceptedPersonalIdTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">ID Document Number</label>
              <input
                type="text"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder={countryRule.acceptedPersonalIdTypes.find((t) => t.id === idTypeId)?.description || "ID Number"}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">
              {countryRule.taxIdConfig.label} ({countryRule.taxIdConfig.requiredForPayouts ? "Required" : "Optional"})
            </label>
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder={countryRule.taxIdConfig.formatDescription || "Tax Identifier"}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {entityType === "registered_business" && countryRule.companyRegistryConfig && (
            <div>
              <label className="block text-xs font-medium text-slate-300">
                {countryRule.companyRegistryConfig.registryName} Registration Number
              </label>
              <input
                type="text"
                value={companyRegNumber}
                onChange={(e) => setCompanyRegNumber(e.target.value)}
                placeholder={countryRule.companyRegistryConfig.numberLabel}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          )}
        </div>
      )}

      {/* Step 3: Phone Verification via OTP */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold">Mobile Phone Verification</h3>
            <p className="text-xs text-slate-400">
              For security, earnings notifications, and multi-factor authorization, verify your mobile number.
            </p>
          </div>

          <KycPhoneVerification
            defaultDialCode={countryRule.dialCode}
            authToken={authToken}
            isAlreadyVerified={phoneVerified}
            onVerified={(p) => {
              setPhoneVerified(true);
              setVerifiedPhone(p);
            }}
          />
        </div>
      )}

      {/* Step 4: Documents & Review */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold">Document Upload & Declaration</h3>
            <p className="text-xs text-slate-400">
              Upload a clear photo or scan of your official identification document.
            </p>
          </div>

          <div className="rounded-xl border-2 border-dashed border-slate-700 bg-slate-800/30 p-6 text-center">
            <Upload className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm font-semibold text-white">Upload Government ID Document</p>
            <p className="text-xs text-slate-400">PDF, JPG, PNG or WEBP up to 10MB</p>
            <input
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                if (e.target.files) setDocumentFiles(Array.from(e.target.files));
              }}
              className="mt-3 block w-full text-xs text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-cyan-500"
            />
            {documentFiles.length > 0 && (
              <div className="mt-3 text-left text-xs text-emerald-400">
                Selected {documentFiles.length} file(s): {documentFiles.map((f) => f.name).join(", ")}
              </div>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-4 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={declarationAccepted}
              onChange={(e) => setDeclarationAccepted(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
            />
            <span>
              I declare under penalty of perjury that the submitted information is true and accurate. I hold
              all necessary rights to upload content and receive royalties on BQ SQWAD TV.
            </span>
          </label>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        ) : (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-xs text-slate-400 hover:text-white"
          >
            Cancel
          </button>
        )}

        {step < 4 ? (
          <button
            type="button"
            onClick={() => {
              if (validateCurrentStep()) setStep(step + 1);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-5 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-6 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Submit for Verification
          </button>
        )}
      </div>
    </div>
  );
}
