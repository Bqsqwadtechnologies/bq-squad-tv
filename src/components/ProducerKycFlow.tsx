import { KycCameraCapture, type CaptureMode } from "@/components/kyc/KycCameraCapture";
import { Camera } from "lucide-react";
import React, { useState, useEffect } from "react";
import { KycCountryPicker } from "@/components/KycCountryPicker";
import { KycPhoneVerification } from "@/components/KycPhoneVerification";
import {
  getCountryRule,
  validateIdFormat,
  validateTaxIdFormat,
  validateCompanyRegistrationFormat,
  isAge18OrOlder,
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
  Save,
  Calendar,
  MapPin,
  CreditCard,
  Info,
} from "lucide-react";

export interface ProducerKycFlowProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  authToken?: string;
  initialCountry?: string;
}


function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(",");
  const mime = arr[0]?.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bstr = atob(arr[1] || "");
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
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

  // Personal Fields
  const [legalName, setLegalName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [residentialLine1, setResidentialLine1] = useState("");
  const [residentialCity, setResidentialCity] = useState("");
  const [residentialState, setResidentialState] = useState("");
  const [residentialPostalCode, setResidentialPostalCode] = useState("");

  // Business Fields
  const [businessName, setBusinessName] = useState("");
  const [companyRegNumber, setCompanyRegNumber] = useState("");
  const [businessLine1, setBusinessLine1] = useState("");
  const [businessCity, setBusinessCity] = useState("");
  const [businessState, setBusinessState] = useState("");
  const [businessPostalCode, setBusinessPostalCode] = useState("");
  const [directorName, setDirectorName] = useState("");

  // Identification & Tax
  const [idTypeId, setIdTypeId] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [taxId, setTaxId] = useState("");

  // Phone verification
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState("");

  // Document files
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [businessCertFile, setBusinessCertFile] = useState<File | null>(null);

  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  // Status & Draft
  const [activeCameraMode, setActiveCameraMode] = useState<CaptureMode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedMessage, setDraftSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const countryRule = getCountryRule(countryCode);

  // Sync accepted ID types when country changes
  useEffect(() => {
    if (countryRule.acceptedPersonalIdTypes.length > 0) {
      const exists = countryRule.acceptedPersonalIdTypes.some((t) => t.id === idTypeId);
      if (!exists) {
        setIdTypeId(countryRule.acceptedPersonalIdTypes[0]!.id);
      }
    }
  }, [countryCode, countryRule.acceptedPersonalIdTypes]);

  // Load existing draft if present
  useEffect(() => {
    let active = true;
    async function loadDraft() {
      try {
        const headers: Record<string, string> = {};
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
        const res = await fetch("/api/public/v1/producer/verification/draft", { headers });
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.draft && typeof data.draft === "object") {
          const d = data.draft;
          if (d.countryCode) setCountryCode(d.countryCode);
          if (d.entityType) setEntityType(d.entityType);
          if (d.legalName) setLegalName(d.legalName);
          if (d.dateOfBirth) setDateOfBirth(d.dateOfBirth);
          if (d.residentialLine1) setResidentialLine1(d.residentialLine1);
          if (d.residentialCity) setResidentialCity(d.residentialCity);
          if (d.residentialState) setResidentialState(d.residentialState);
          if (d.residentialPostalCode) setResidentialPostalCode(d.residentialPostalCode);
          if (d.businessName) setBusinessName(d.businessName);
          if (d.companyRegNumber) setCompanyRegNumber(d.companyRegNumber);
          if (d.businessLine1) setBusinessLine1(d.businessLine1);
          if (d.businessCity) setBusinessCity(d.businessCity);
          if (d.businessState) setBusinessState(d.businessState);
          if (d.businessPostalCode) setBusinessPostalCode(d.businessPostalCode);
          if (d.directorName) setDirectorName(d.directorName);
          if (d.idTypeId) setIdTypeId(d.idTypeId);
          if (d.idNumber) setIdNumber(d.idNumber);
          if (d.taxId) setTaxId(d.taxId);
          if (d.phoneVerified) setPhoneVerified(true);
          if (d.verifiedPhone) setVerifiedPhone(d.verifiedPhone);
          if (typeof d.step === "number" && d.step >= 1 && d.step <= 4) setStep(d.step);
        }
      } catch {
        // Non-blocking
      }
    }
    loadDraft();
    return () => {
      active = false;
    };
  }, [authToken]);

  async function handleSaveDraft() {
    setSavingDraft(true);
    setDraftSavedMessage(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
      const draftPayload = {
        step,
        countryCode,
        entityType,
        legalName,
        dateOfBirth,
        residentialLine1,
        residentialCity,
        residentialState,
        residentialPostalCode,
        businessName,
        companyRegNumber,
        businessLine1,
        businessCity,
        businessState,
        businessPostalCode,
        directorName,
        idTypeId,
        idNumber,
        taxId,
        phoneVerified,
        verifiedPhone,
      };
      const res = await fetch("/api/public/v1/producer/verification/draft", {
        method: "PUT",
        headers,
        body: JSON.stringify(draftPayload),
      });
      if (res.ok) {
        setDraftSavedMessage("Progress saved. You can safely return later.");
        setTimeout(() => setDraftSavedMessage(null), 4000);
      }
    } catch {
      // Ignore
    } finally {
      setSavingDraft(false);
    }
  }

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

      if (entityType === "individual") {
        if (!dateOfBirth) {
          setError("Date of birth is required for personal verification.");
          return false;
        }
        if (!isAge18OrOlder(dateOfBirth)) {
          setError("You must be 18 years or older to register as a content producer.");
          return false;
        }
        if (!residentialLine1.trim() || !residentialCity.trim()) {
          setError("Please enter your residential address (street address and city).");
          return false;
        }
      }

      if (entityType === "registered_business") {
        if (!businessName.trim()) {
          setError("Please enter your registered company or studio name.");
          return false;
        }
        if (!companyRegNumber.trim()) {
          setError("Please enter your company registration number.");
          return false;
        }
        const regCheck = validateCompanyRegistrationFormat(countryCode, companyRegNumber);
        if (!regCheck.valid) {
          setError(regCheck.message || "Invalid Company Registration number format.");
          return false;
        }
        if (!businessLine1.trim() || !businessCity.trim()) {
          setError("Please enter your registered business address.");
          return false;
        }
        if (!directorName.trim()) {
          setError("Please enter the managing director or authorized representative name.");
          return false;
        }
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
      if (entityType === "individual") {
        if (!idFrontFile) {
          setError("Please upload the front of your government ID document.");
          return false;
        }
        if (!selfieFile) {
          setError("Please upload a selfie holding your ID document.");
          return false;
        }
      } else {
        if (!businessCertFile) {
          setError("Please upload your company registration certificate or incorporation document.");
          return false;
        }
        if (!idFrontFile) {
          setError("Please upload the director's official ID document.");
          return false;
        }
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

      // Collect files to upload
      const filesToUpload: File[] = [];
      if (idFrontFile) filesToUpload.push(idFrontFile);
      if (idBackFile) filesToUpload.push(idBackFile);
      if (selfieFile) filesToUpload.push(selfieFile);
      if (businessCertFile) filesToUpload.push(businessCertFile);

      // Upload documents through upload intent
      const evidenceUploadIds: string[] = [];

      for (const file of filesToUpload) {
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

      if (filesToUpload.length > 0 && evidenceUploadIds.length === 0) {
        throw new Error("Document upload failed. Please verify your connection and try again.");
      }
      if (evidenceUploadIds.length === 0) {
        throw new Error("Please upload or capture your required verification documents.");
      }
      // Submit verification record with collected upload IDs
      const res = await fetch("/api/public/v1/producer/verification", {
        method: "POST",
        headers,
        body: JSON.stringify({
          countryCode,
          entityType,
          legalName: legalName.trim(),
          businessName: entityType === "registered_business" ? businessName.trim() : undefined,
          evidenceUploadIds,
          declarationAccepted: true,
          phone: verifiedPhone || undefined,
          phoneVerified,
          idTypeId,
          idNumber: idNumber.trim() || undefined,
          taxId: taxId.trim() || undefined,
          dateOfBirth: entityType === "individual" ? dateOfBirth || undefined : undefined,
          companyRegNumber: entityType === "registered_business" ? companyRegNumber.trim() || undefined : undefined,
          directorName: entityType === "registered_business" ? directorName.trim() || undefined : undefined,
          residentialAddress: entityType === "individual" ? {
            line1: residentialLine1.trim(),
            city: residentialCity.trim(),
            state: residentialState.trim() || undefined,
            postalCode: residentialPostalCode.trim() || undefined,
            country: countryCode,
          } : undefined,
          businessAddress: entityType === "registered_business" ? {
            line1: businessLine1.trim(),
            city: businessCity.trim(),
            state: businessState.trim() || undefined,
            postalCode: businessPostalCode.trim() || undefined,
            country: countryCode,
          } : undefined,
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
      {/* Calm Trust Notice Panel */}
      <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-3.5 text-xs text-slate-300">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-400" />
          <span>Your information is encrypted and protected. We use it only to verify your identity and to pay you.</span>
          <a
            href="/help/data-protection"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-cyan-300 hover:text-cyan-200 underline"
          >
            Learn more
          </a>
        </div>
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={savingDraft}
          className="flex items-center gap-1.5 shrink-0 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          <Save className="h-3.5 w-3.5 text-cyan-400" />
          {savingDraft ? "Saving..." : "Save Draft"}
        </button>
      </div>

      {draftSavedMessage && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{draftSavedMessage}</span>
        </div>
      )}

      {/* Stepper indicator */}
      <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4 text-xs font-medium">
        <span className={step === 1 ? "text-cyan-400 font-bold" : "text-slate-400"}>1. Country</span>
        <span className="text-slate-600">→</span>
        <span className={step === 2 ? "text-cyan-400 font-bold" : "text-slate-400"}>2. Entity & Details</span>
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

      {/* Step 2: Entity & Identification Details */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold">Entity Type & Legal Information</h3>
            <p className="text-xs text-slate-400">
              Select your registration type and provide matching legal identification details.
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
                <div className="text-xs text-slate-400">Solo filmmaker or producer (18+)</div>
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
                <div className="text-xs text-slate-400">Registered company / corporate entity</div>
              </div>
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">
              Legal Full Name (as on official government ID)
            </label>
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="e.g. Chukwuemeka Adebayo or Jane Doe"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {entityType === "individual" && (
            <div>
              <label className="block text-xs font-medium text-slate-300">
                Date of Birth (Must be 18 years or older)
              </label>
              <div className="relative mt-1">
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              {dateOfBirth && !isAge18OrOlder(dateOfBirth) && (
                <p className="mt-1 text-xs text-rose-400">You must be at least 18 years old to verify.</p>
              )}
            </div>
          )}

          {entityType === "registered_business" && (
            <>
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

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  {countryRule.companyRegistryConfig?.registryName || "Company Registry"} Number
                </label>
                <input
                  type="text"
                  value={companyRegNumber}
                  onChange={(e) => setCompanyRegNumber(e.target.value)}
                  placeholder={countryRule.companyRegistryConfig?.numberLabel || "Registration number"}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Managing Director / Authorized Representative Full Name
                </label>
                <input
                  type="text"
                  value={directorName}
                  onChange={(e) => setDirectorName(e.target.value)}
                  placeholder="Director full legal name"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </>
          )}

          {/* Address Fields */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
              <MapPin className="h-4 w-4" />
              <span>{entityType === "individual" ? "Residential Address" : "Registered Business Address"}</span>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300">Street Address</label>
              <input
                type="text"
                value={entityType === "individual" ? residentialLine1 : businessLine1}
                onChange={(e) =>
                  entityType === "individual"
                    ? setResidentialLine1(e.target.value)
                    : setBusinessLine1(e.target.value)
                }
                placeholder="123 Main Street"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-300">City</label>
                <input
                  type="text"
                  value={entityType === "individual" ? residentialCity : businessCity}
                  onChange={(e) =>
                    entityType === "individual"
                      ? setResidentialCity(e.target.value)
                      : setBusinessCity(e.target.value)
                  }
                  placeholder="City"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">State / Region</label>
                <input
                  type="text"
                  value={entityType === "individual" ? residentialState : businessState}
                  onChange={(e) =>
                    entityType === "individual"
                      ? setResidentialState(e.target.value)
                      : setBusinessState(e.target.value)
                  }
                  placeholder="State"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">Postal Code</label>
                <input
                  type="text"
                  value={entityType === "individual" ? residentialPostalCode : businessPostalCode}
                  onChange={(e) =>
                    entityType === "individual"
                      ? setResidentialPostalCode(e.target.value)
                      : setBusinessPostalCode(e.target.value)
                  }
                  placeholder="Postal Code"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300">
                {entityType === "individual" ? "Government ID Type" : "Director's ID Type"}
              </label>
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

          {/* Payout Account Matching Notice */}
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs text-amber-200">
            <CreditCard className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <strong className="text-white">Payout Account Name Requirement: </strong>
              When setting up your payout bank account in Part B, the bank account holder name must match{" "}
              <strong className="text-amber-300">
                {entityType === "individual" ? legalName || "your legal name" : businessName || "your registered studio name"}
              </strong>
              . Mismatched accounts are flagged and cannot disburse funds.
            </div>
          </div>
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
            <h3 className="text-lg font-bold">Document Uploads & Declaration</h3>
            <p className="text-xs text-slate-400">
              Upload clear photos or scans of your official documents. Encrypted and stored in private vault.
            </p>
          </div>

          {entityType === "individual" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <div className="flex items-center justify-between">
      <label className="block text-xs font-semibold text-white">1. ID Document Front</label>
      <button
        type="button"
        onClick={() => setActiveCameraMode("id_card_front")}
        className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/20 transition"
      >
        <Camera className="h-3.5 w-3.5" /> Capture with Camera
      </button>
    </div>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setIdFrontFile(e.target.files[0]);
                  }}
                  className="mt-2 block w-full text-xs text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-cyan-500"
                />
                {idFrontFile && <p className="mt-1 text-xs text-emerald-400">Selected: {idFrontFile.name}</p>}
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <div className="flex items-center justify-between">
      <label className="block text-xs font-semibold text-white">2. ID Document Back (if applicable)</label>
      <button
        type="button"
        onClick={() => setActiveCameraMode("id_card_back")}
        className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/20 transition"
      >
        <Camera className="h-3.5 w-3.5" /> Capture with Camera
      </button>
    </div>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setIdBackFile(e.target.files[0]);
                  }}
                  className="mt-2 block w-full text-xs text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-cyan-500"
                />
                {idBackFile && <p className="mt-1 text-xs text-emerald-400">Selected: {idBackFile.name}</p>}
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <div className="flex items-center justify-between">
      <label className="block text-xs font-semibold text-white">3. Face Liveness & Selfie Verification</label>
      <button
        type="button"
        onClick={() => setActiveCameraMode("face_liveness")}
        className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/20 transition"
      >
        <Camera className="h-3.5 w-3.5" /> Start Face Liveness
      </button>
    </div>
                <p className="text-xs text-slate-400">Ensure your face and the ID details are both clearly visible.</p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setSelfieFile(e.target.files[0]);
                  }}
                  className="mt-2 block w-full text-xs text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-cyan-500"
                />
                {selfieFile && <p className="mt-1 text-xs text-emerald-400">Selected: {selfieFile.name}</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <label className="block text-xs font-semibold text-white">1. Company Registration Certificate</label>
                <p className="text-xs text-slate-400">Certificate of Incorporation, CAC registration, or business license.</p>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setBusinessCertFile(e.target.files[0]);
                  }}
                  className="mt-2 block w-full text-xs text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-cyan-500"
                />
                {businessCertFile && <p className="mt-1 text-xs text-emerald-400">Selected: {businessCertFile.name}</p>}
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <label className="block text-xs font-semibold text-white">2. Managing Director Government ID</label>
                <p className="text-xs text-slate-400">Passport, National ID or Driver's License of authorized director.</p>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setIdFrontFile(e.target.files[0]);
                  }}
                  className="mt-2 block w-full text-xs text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-cyan-500"
                />
                {idFrontFile && <p className="mt-1 text-xs text-emerald-400">Selected: {idFrontFile.name}</p>}
              </div>
            </div>
          )}

          <label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-4 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={declarationAccepted}
              onChange={(e) => setDeclarationAccepted(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
            />
            <span>
              I declare under penalty of perjury that the submitted information is true and accurate. I hold
              all necessary rights to upload content, represent this entity, and receive streaming earnings on BQ SQWAD TV.
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={savingDraft}
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
          >
            <Save className="h-3.5 w-3.5 text-cyan-400" />
            Save Draft
          </button>

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
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <p className="text-[10px] text-slate-400 max-w-xs text-right">
                By submitting, you consent to identity verification under our{" "}
                <a href="/help/data-protection" target="_blank" rel="noreferrer" className="text-cyan-300 underline font-medium">
                  Data Protection &amp; Trust Policy
                </a>.
              </p>
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
            </div>
          )}
        </div>
      </div>
      {activeCameraMode && (
        <KycCameraCapture
          mode={activeCameraMode}
          onCapture={(result) => {
            if (activeCameraMode === "id_card_front") {
              setIdFrontFile(dataUrlToFile(result.dataUrl, "id-front.jpg"));
            } else if (activeCameraMode === "id_card_back") {
              setIdBackFile(dataUrlToFile(result.dataUrl, "id-back.jpg"));
            } else if (activeCameraMode === "face_liveness") {
              setSelfieFile(dataUrlToFile(result.dataUrl, "face-liveness.jpg"));
            }
            setActiveCameraMode(null);
          }}
          onUploadFileInstead={() => setActiveCameraMode(null)}
          onClose={() => setActiveCameraMode(null)}
        />
      )}
    </div>
  );
}