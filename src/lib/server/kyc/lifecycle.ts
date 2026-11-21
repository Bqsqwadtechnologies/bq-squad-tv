import { Firestore } from "@/lib/server/firebase-admin";
import { KycProfile } from "@/lib/server/kyc/types";
import { writeAuditLog } from "@/lib/server/audit";
import { dispatchNotificationEvent } from "@/lib/server/email/outbox";

export interface ExpiryScanResult {
  scannedCount: number;
  reminded30Days: string[];
  reminded7Days: string[];
  markedExpired: string[];
}

export function computeNextReverificationDate(riskLevel: string = "low"): string {
  const now = new Date();
  // High risk cases re-verify every 12 months; low/medium cases every 24 months
  const months = riskLevel === "high" ? 12 : 24;
  const target = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
  return target.toISOString();
}

export function evaluateDocumentExpiry(expiryDateStr?: string | null): {
  isExpired: boolean;
  daysRemaining: number | null;
} {
  if (!expiryDateStr) return { isExpired: false, daysRemaining: null };
  const expiryTime = new Date(expiryDateStr).getTime();
  if (isNaN(expiryTime)) return { isExpired: false, daysRemaining: null };

  const diffMs = expiryTime - Date.now();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return {
    isExpired: daysRemaining <= 0,
    daysRemaining,
  };
}

export async function scanAndProcessDocumentExpiries(fs: any): Promise<ExpiryScanResult> {
  const allProfilesRaw = await fs.query("kycProfiles", { limit: 500 }).catch(() => []);
  const profiles = allProfilesRaw as KycProfile[];
  const now = new Date().toISOString();

  const result: ExpiryScanResult = {
    scannedCount: profiles.length,
    reminded30Days: [],
    reminded7Days: [],
    markedExpired: [],
  };

  for (const p of profiles) {
    if (p.kycStatus !== "approved") continue;

    const expiryCheck = evaluateDocumentExpiry(p.idExpiryDate);
    if (expiryCheck.daysRemaining === null) continue;

    const days = expiryCheck.daysRemaining;

    // Document expired -> transition to expired status & lock payouts
    if (days <= 0) {
      await fs.patchDoc(`kycProfiles/${p.uid}`, {
        kycStatus: "expired",
        expiredAt: now,
        updatedAt: now,
      });

      // Update producer / provider verification status
      if (p.role === "producer") {
        await fs.patchDoc(`producers/${p.uid}`, {
          kycStatus: "expired",
          verificationStatus: "REJECTED",
        }).catch(() => {});
      } else if (p.role === "provider") {
        await fs.patchDoc(`providers/${p.uid}`, {
          kycStatus: "expired",
          verificationStatus: "REJECTED",
        }).catch(() => {});
      }

      await writeAuditLog(fs, {
        action: "kyc.document_expired_auto",
        actorUid: "system_scheduler",
        targetType: "user",
        targetId: p.uid,
        reason: "Applicant government-issued identity document expired.",
        metadata: { idExpiryDate: p.idExpiryDate },
      });

      if (p.officialEmail && p.officialEmail.includes("@")) {
        await dispatchNotificationEvent(fs, {
          eventType: "kyc_rejected",
          recipientUid: p.uid,
          recipientEmail: p.officialEmail,
          ...(p.legalName ? { recipientName: p.legalName } : {}),
          currentStatus: "expired",
          nextStep: "Upload renewed identity documentation for re-verification.",
          reason: "Applicant government-issued identity document has expired. Re-verification required.",
        }).catch(() => {});
      }

      result.markedExpired.push(p.uid);
    } else if (days <= 7 && !p.expiryReminder7DaySent) {
      // 7-day reminder
      await fs.patchDoc(`kycProfiles/${p.uid}`, {
        expiryReminder7DaySent: true,
        expiryReminder7DaySentAt: now,
      });

      if (p.officialEmail && p.officialEmail.includes("@")) {
        await dispatchNotificationEvent(fs, {
          eventType: "kyc_needs_changes",
          recipientUid: p.uid,
          recipientEmail: p.officialEmail,
          ...(p.legalName ? { recipientName: p.legalName } : {}),
          currentStatus: p.kycStatus,
          nextStep: "Upload renewed identity documentation before expiry.",
          reason: `Urgent: Your ID Document expires in ${days} days. Please upload renewed documentation.`,
        }).catch(() => {});
      }

      result.reminded7Days.push(p.uid);
    } else if (days <= 30 && !p.expiryReminder30DaySent) {
      // 30-day reminder
      await fs.patchDoc(`kycProfiles/${p.uid}`, {
        expiryReminder30DaySent: true,
        expiryReminder30DaySentAt: now,
      });

      if (p.officialEmail && p.officialEmail.includes("@")) {
        await dispatchNotificationEvent(fs, {
          eventType: "kyc_needs_changes",
          recipientUid: p.uid,
          recipientEmail: p.officialEmail,
          ...(p.legalName ? { recipientName: p.legalName } : {}),
          currentStatus: p.kycStatus,
          nextStep: "Prepare renewed identity documentation before expiry.",
          reason: `Reminder: Your ID Document expires in ${days} days. Please prepare renewal documentation.`,
        }).catch(() => {});
      }

      result.reminded30Days.push(p.uid);
    }
  }

  return result;
}
