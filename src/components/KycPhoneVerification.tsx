import React, { useState, useEffect } from "react";
import { CheckCircle2, Phone, Mail, Clock, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";

export interface KycPhoneVerificationProps {
  initialPhone?: string;
  defaultDialCode?: string;
  isAlreadyVerified?: boolean;
  onVerified?: (phone: string) => void;
  authToken?: string;
}

export function KycPhoneVerification({
  initialPhone = "",
  defaultDialCode = "+1",
  isAlreadyVerified = false,
  onVerified,
  authToken,
}: KycPhoneVerificationProps) {
  const [phoneNumber, setPhoneNumber] = useState(
    initialPhone.startsWith("+") ? initialPhone.replace(/^\+\d+/, "") : initialPhone
  );
  const [dialCode, setDialCode] = useState(
    initialPhone.startsWith("+") ? initialPhone.match(/^\+\d+/)?.[0] || defaultDialCode : defaultDialCode
  );
  const [isVerified, setIsVerified] = useState(isAlreadyVerified);
  const [verifiedPhone, setVerifiedPhone] = useState(initialPhone);

  const [step, setStep] = useState<"input" | "code_sent" | "verified">(
    isAlreadyVerified ? "verified" : "input"
  );
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [deliveryMethod, setDeliveryMethod] = useState<"sms" | "email">("sms");

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const fullE164Phone = `${dialCode}${phoneNumber.replace(/\D/g, "")}`;

  async function handleSendCode(fallbackEmail = false) {
    setError(null);
    if (!phoneNumber.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    if (!/^\+[1-9]\d{6,14}$/.test(fullE164Phone)) {
      setError("Please enter a valid international mobile number.");
      return;
    }

    setLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch("/api/public/v1/kyc/otp", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "send_otp",
          phone: fullE164Phone,
          preferEmailFallback: fallbackEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || "Failed to send verification code.");
      }

      setDeliveryMethod(data.method === "email" ? "email" : "sms");
      setStep("code_sent");
      setResendCooldown(data.resendDelaySeconds || 60);
    } catch (err: any) {
      setError(err.message || "Could not send verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(otpCode.trim())) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch("/api/public/v1/kyc/otp", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "verify_otp",
          phone: fullE164Phone,
          code: otpCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || "Verification code is incorrect or expired.");
      }

      setIsVerified(true);
      setVerifiedPhone(fullE164Phone);
      setStep("verified");
      if (onVerified) {
        onVerified(fullE164Phone);
      }
    } catch (err: any) {
      setError(err.message || "Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "verified" || isVerified) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">Phone Verified</span>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                  Verified
                </span>
              </div>
              <p className="font-mono text-sm text-slate-300">{verifiedPhone || fullE164Phone}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsVerified(false);
              setStep("input");
            }}
            className="text-xs text-slate-400 underline hover:text-white"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Phone className="h-4 w-4 text-cyan-400" />
          <span>Mobile Phone Verification</span>
        </div>
        <span className="text-xs text-slate-400">Required for KYC Payouts</span>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {step === "input" && (
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-300">
            Mobile Number (with country code)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={dialCode}
              onChange={(e) => setDialCode(e.target.value)}
              placeholder="+1"
              className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
            />
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="415 555 2671"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            disabled={loading || !phoneNumber.trim()}
            onClick={() => handleSendCode(false)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Send 6-Digit Code via SMS
          </button>
        </div>
      )}

      {step === "code_sent" && (
        <form onSubmit={handleVerifyCode} className="space-y-3">
          <div className="rounded-lg bg-slate-800/80 p-3 text-xs text-slate-300">
            {deliveryMethod === "sms" ? (
              <p>
                We sent a 6-digit code to <strong className="text-white">{fullE164Phone}</strong>. It expires in 10 minutes.
              </p>
            ) : (
              <p>
                SMS could not reach this destination. We sent the 6-digit verification code to your registered <strong className="text-white">email address</strong>.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">
              Enter 6-Digit Verification Code
            </label>
            <input
              type="text"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              autoFocus
              className="mt-1 w-full tracking-[0.5em] rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-center font-mono text-lg font-bold text-cyan-300 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify Code"}
            </button>
            <button
              type="button"
              disabled={loading || resendCooldown > 0}
              onClick={() => handleSendCode(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
            >
              {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend SMS"}
            </button>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleSendCode(true)}
            className="flex w-full items-center justify-center gap-1.5 pt-1 text-xs text-slate-400 hover:text-cyan-400"
          >
            <Mail className="h-3.5 w-3.5" />
            Didn't receive SMS? Send code to my email instead
          </button>
        </form>
      )}
    </div>
  );
}
