import { Firestore } from "@/lib/server/firebase-admin";

export type RestreamingAlert = {
  sessionId: string;
  uid: string;
  resourcePath: string;
  primaryIp: string;
  conflictingIp: string;
  userAgent: string;
  timestamp: string;
  reason: "IP_HOPPING" | "EXCESSIVE_VELOCITY" | "CONCURRENT_GEO_MISMATCH";
};

export async function logRestreamingForensicAlert(
  fs: Firestore,
  alert: RestreamingAlert,
): Promise<void> {
  try {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await fs.setDoc(`restreamingForensics/${alertId}`, {
      ...alert,
      createdAt: alert.timestamp,
    });

    // Also record in audit log
    await fs.setDoc(`auditEvents/${alertId}`, {
      action: "SUSPECTED_RESTREAMING",
      actorId: alert.uid,
      targetId: alert.sessionId,
      details: {
        reason: alert.reason,
        primaryIp: alert.primaryIp,
        conflictingIp: alert.conflictingIp,
        resourcePath: alert.resourcePath,
      },
      createdAt: alert.timestamp,
    });
  } catch (err) {
    // Non-fatal logging
    console.error("[FORENSICS] Failed to record restreaming alert:", err);
  }
}

export function isAllowedStreamingOrigin(originOrReferer: string | null): boolean {
  if (!originOrReferer) return true; // Direct app / proxy calls without referer
  try {
    const url = new URL(originOrReferer);
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "bqsqwad.tv" ||
      host.endsWith(".bqsqwad.tv") ||
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com") ||
      url.protocol === "android-app:"
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
