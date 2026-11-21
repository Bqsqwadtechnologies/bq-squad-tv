/**
 * BQ SQWAD TV — Durable Email Status & Notification Outbox (Batch B7)
 *
 * Rules:
 * 1. Verification and payout notifications go strictly to the user's EMAIL and IN-APP notices.
 *    Never SMS (SMS is exclusively reserved for short-lived phone verification OTP).
 * 2. Status changes create both an email in the durable outbox and an in-app notice.
 * 3. Outbox supports retry with exponential backoff and owner manual resend from Zillionaire.
 * 4. Stable event schema with documented AI assistant hook (see docs/DECISIONS.md).
 */

import { Firestore, ApiError } from "../firebase-admin";
import { escapeHtml } from "./brevo";

export const NOTIFICATION_EMAIL_EVENTS = [
  "kyc_submitted",
  "kyc_under_review",
  "kyc_needs_changes",
  "kyc_approved",
  "kyc_rejected",
  "payout_account_approved",
  "payout_account_rejected",
  "payout_requested",
  "payout_approved",
  "payout_on_hold",
  "payout_paid",
  "payout_failed_or_returned",
] as const;

export type NotificationEmailEventType = (typeof NOTIFICATION_EMAIL_EVENTS)[number];

export type OutboxItemStatus = "queued" | "sent" | "failed" | "retried";

export interface NotificationEventPayload {
  eventType: NotificationEmailEventType;
  recipientUid: string;
  recipientEmail: string;
  recipientName?: string;
  // Core status details repeated in email
  currentStatus: string;
  nextStep: string;
  reason?: string; // Reason when rejected / needs changes / on hold / returned
  amountMinor?: number;
  currency?: string;
  paymentReference?: string;
  receiptUrl?: string;
  deepLink?: string;
  metadata?: Record<string, unknown>;
}

export interface DurableOutboxRecord {
  id: string;
  eventType: NotificationEmailEventType;
  recipientUid: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  textContent: string;
  htmlContent: string;
  status: OutboxItemStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  lastError: string | null;
  receiptUrl: string | null;
  payload: Record<string, unknown>;
  aiHookMetadata: {
    hookName: string;
    hookVersion: string;
    readyForAiPersonalization: boolean;
    documentedIn: string;
    eventType: NotificationEmailEventType;
  };
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

/**
 * AI Assistant Hook (Batch B7)
 *
 * Clean, documented stable event descriptor designed for future AI assistants
 * to draft, personalize, or summarize notification emails.
 * Reference: docs/DECISIONS.md (Batch B7)
 */
export interface AiAssistantEmailEvent {
  hookVersion: "1.0";
  eventType: NotificationEmailEventType;
  recipient: {
    uid: string;
    email: string;
    displayName: string;
  };
  context: {
    currentStatus: string;
    nextStep: string;
    reason?: string;
    amountFormatted?: string;
    paymentReference?: string;
    receiptUrl?: string;
    dashboardUrl: string;
  };
  baseTemplate: {
    subject: string;
    textContent: string;
  };
  rawPayload: Record<string, unknown>;
}

/**
 * Prepares a stable, AI-ready payload. Future AI assistants can intercept this
 * hook to personalize tone, localize language, or draft contextual guidance.
 */
export function prepareAiAssistantEmailPayload(
  payload: NotificationEventPayload,
  subject: string,
  textContent: string,
): AiAssistantEmailEvent {
  const amountFormatted =
    typeof payload.amountMinor === "number"
      ? `${payload.currency || "USD"} ${(payload.amountMinor / 100).toFixed(2)}`
      : undefined;

  return {
    hookVersion: "1.0",
    eventType: payload.eventType,
    recipient: {
      uid: payload.recipientUid,
      email: payload.recipientEmail,
      displayName: payload.recipientName || "Creator",
    },
    context: {
      currentStatus: payload.currentStatus,
      nextStep: payload.nextStep,
      reason: payload.reason,
      amountFormatted,
      paymentReference: payload.paymentReference,
      receiptUrl: payload.receiptUrl,
      dashboardUrl: payload.deepLink || "https://tv.bqsqwad.com/producer",
    },
    baseTemplate: {
      subject,
      textContent,
    },
    rawPayload: payload.metadata || {},
  };
}

/**
 * Generates subject line, plain text and HTML content for each of the 12 events.
 * Strictest requirement: "The email repeats the same status and next step."
 */
export function renderEmailTemplate(event: NotificationEventPayload): {
  subject: string;
  textContent: string;
  htmlContent: string;
  inAppTitle: string;
  inAppBody: string;
} {
  const name = event.recipientName || "there";
  const status = event.currentStatus;
  const nextStep = event.nextStep;
  const reasonText = event.reason ? `Reason: ${event.reason}` : "";
  const reasonHtml = event.reason
    ? `<div style="background-color:#fee2e2;border-left:4px solid #ef4444;padding:12px;margin:16px 0;border-radius:6px;color:#991b1b;font-size:14px;"><strong>Note:</strong> ${escapeHtml(event.reason)}</div>`
    : "";

  const link = event.deepLink || "https://tv.bqsqwad.com/producer";
  const amountStr =
    typeof event.amountMinor === "number"
      ? `${event.currency || "USD"} ${(event.amountMinor / 100).toFixed(2)}`
      : "";

  let subject = "";
  let inAppTitle = "";
  let inAppBody = "";
  let mainBody = "";

  switch (event.eventType) {
    case "kyc_submitted":
      subject = "Your identity verification (KYC) has been submitted";
      inAppTitle = "KYC Submitted";
      inAppBody = "Your verification documents have been received and are queued for review.";
      mainBody = `Thank you for submitting your identity verification documents. Our compliance team will review your application.`;
      break;

    case "kyc_under_review":
      subject = "Your identity verification is currently under review";
      inAppTitle = "KYC Under Review";
      inAppBody = "Our compliance team is actively reviewing your submitted verification documents.";
      mainBody = `Your identity verification documents are currently being checked by our compliance team.`;
      break;

    case "kyc_needs_changes":
      subject = "Action required: Changes needed for your identity verification";
      inAppTitle = "KYC Needs Changes";
      inAppBody = `Your verification requires updates: ${event.reason || "Please review and re-upload."}`;
      mainBody = `We reviewed your identity verification submission, but need a few corrections before we can complete approval.`;
      break;

    case "kyc_approved":
      subject = "Congratulations! Your identity verification (KYC) is approved";
      inAppTitle = "KYC Approved";
      inAppBody = "Your identity verification has been approved. Payout and full creator features are now enabled.";
      mainBody = `Great news! Your identity verification has been verified and approved. You can now configure your payout account and receive earnings.`;
      break;

    case "kyc_rejected":
      subject = "Your identity verification could not be approved";
      inAppTitle = "KYC Not Approved";
      inAppBody = `Your verification submission was not approved: ${event.reason || "See email for details."}`;
      mainBody = `Unfortunately, your identity verification application could not be approved at this time.`;
      break;

    case "payout_account_approved":
      subject = "Your payout bank account has been approved";
      inAppTitle = "Payout Account Approved";
      inAppBody = "Your registered payout account is verified and active for scheduled earnings transfers.";
      mainBody = `Your registered payout bank account has been verified and approved. Future earnings disbursements will be sent to this destination.`;
      break;

    case "payout_account_rejected":
      subject = "Action required: Payout account details could not be verified";
      inAppTitle = "Payout Account Not Approved";
      inAppBody = `Your payout account was not approved: ${event.reason || "Please check your account details."}`;
      mainBody = `We were unable to verify your submitted payout bank account details.`;
      break;

    case "payout_requested":
      subject = `Payout request received: ${amountStr}`;
      inAppTitle = "Payout Requested";
      inAppBody = `Your payout request for ${amountStr} has been submitted for review.`;
      mainBody = `Your request to withdraw ${amountStr} in accrued earnings has been logged and queued for compliance review.`;
      break;

    case "payout_approved":
      subject = `Your payout of ${amountStr} has been approved`;
      inAppTitle = "Payout Approved";
      inAppBody = `Your payout of ${amountStr} is approved and scheduled for bank wire transfer.`;
      mainBody = `Your payout of ${amountStr} has passed review and is approved for transfer.`;
      break;

    case "payout_on_hold":
      subject = `Notice: Your payout of ${amountStr} is currently on hold`;
      inAppTitle = "Payout On Hold";
      inAppBody = `Your payout of ${amountStr} is temporarily on hold: ${event.reason || "Compliance check required."}`;
      mainBody = `Your payout request for ${amountStr} is temporarily on hold.`;
      break;

    case "payout_paid":
      subject = `Payment sent: ${amountStr} has been paid`;
      inAppTitle = "Payout Paid";
      inAppBody = `Your payout of ${amountStr} (Ref: ${event.paymentReference || "N/A"}) has been disbursed.`;
      mainBody = `Your payout of ${amountStr} has been processed and disbursed to your registered bank account. Payment Reference: ${event.paymentReference || "Provided in receipt"}.`;
      break;

    case "payout_failed_or_returned":
      subject = `Notice: Payout transfer of ${amountStr} was returned by receiving bank`;
      inAppTitle = "Payout Returned";
      inAppBody = `Payout transfer was returned: ${event.reason || "Account unreachable"}. Funds restored to balance.`;
      mainBody = `Your payout transfer of ${amountStr} could not be completed by the banking network and was returned. Accrued funds have been restored to your earnings balance.`;
      break;
  }

  const receiptSectionText = event.receiptUrl ? `\nPayment Receipt: ${event.receiptUrl}\n` : "";
  const receiptSectionHtml = event.receiptUrl
    ? `<p style="margin-top:12px;"><a href="${escapeHtml(event.receiptUrl)}" target="_blank" style="display:inline-block;background-color:#0891b2;color:#ffffff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Download Payment Receipt (PDF)</a></p>`
    : "";

  const textContent = [
    `Hello ${name},`,
    "",
    mainBody,
    reasonText ? `\n${reasonText}` : "",
    "",
    `Current Status: ${status}`,
    `Next Step: ${nextStep}`,
    receiptSectionText,
    `View your account & earnings: ${link}`,
    "",
    "Best regards,",
    "The BQ SQWAD TV Team",
    "tv@bqsqwad.com",
  ].filter(Boolean).join("\n");

  const htmlContent = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f8fafc;color:#1e293b;">
  <div style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <div style="border-bottom:1px solid #e2e8f0;padding-bottom:16px;margin-bottom:24px;">
      <h2 style="margin:0;font-size:20px;color:#0f172a;letter-spacing:-0.5px;">BQ SQWAD TV</h2>
      <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Creator &amp; Partner Notifications</p>
    </div>

    <p style="font-size:15px;line-height:24px;margin:0 0 16px;">Hello ${escapeHtml(name)},</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 16px;">${escapeHtml(mainBody)}</p>

    ${reasonHtml}

    <div style="background-color:#f1f5f9;border-radius:8px;padding:16px;margin:20px 0;">
      <p style="margin:0 0 8px;font-size:13px;color:#475569;">
        <strong style="color:#0f172a;">Current Status:</strong> ${escapeHtml(status)}
      </p>
      <p style="margin:0;font-size:13px;color:#475569;">
        <strong style="color:#0f172a;">Next Step:</strong> ${escapeHtml(nextStep)}
      </p>
    </div>

    ${receiptSectionHtml}

    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;line-height:18px;">
      <p style="margin:0 0 4px;"><a href="${escapeHtml(link)}" style="color:#0891b2;text-decoration:none;font-weight:600;">Open your dashboard &rarr;</a></p>
      <p style="margin:8px 0 0;">This email was sent to ${escapeHtml(event.recipientEmail)}. Payment and verification notices are sent exclusively via email for security. Questions? Contact <a href="mailto:tv@bqsqwad.com" style="color:#64748b;">tv@bqsqwad.com</a>.</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, textContent, htmlContent, inAppTitle, inAppBody };
}

/**
 * Calculates exponential backoff time in milliseconds.
 * Attempt 1: 1 min, Attempt 2: 5 min, Attempt 3: 15 min, Attempt 4: 60 min.
 */
export function calculateNextBackoffMs(attempt: number): number {
  switch (attempt) {
    case 1:
      return 60 * 1000; // 1 min
    case 2:
      return 5 * 60 * 1000; // 5 min
    case 3:
      return 15 * 60 * 1000; // 15 min
    case 4:
    default:
      return 60 * 60 * 1000; // 60 min
  }
}

/**
 * Dispatches an event: creates both an in-app notice and an outbox email record,
 * then attempts delivery immediately.
 */
export async function dispatchNotificationEvent(
  fs: Firestore,
  event: NotificationEventPayload,
): Promise<{ outboxId: string; status: OutboxItemStatus }> {
  // Validate required fields
  if (!event.recipientEmail || !event.recipientEmail.includes("@")) {
    throw new ApiError(400, "INVALID_EMAIL", "A valid recipient email is required.");
  }
  if (!event.recipientUid) {
    throw new ApiError(400, "INVALID_RECIPIENT", "Recipient UID is required.");
  }

  const { subject, textContent, htmlContent, inAppTitle, inAppBody } = renderEmailTemplate(event);
  const outboxId = "outbox_" + crypto.randomUUID();
  const now = new Date().toISOString();

  // 1. Write in-app notice
  const inAppNoticeId = "notif_" + crypto.randomUUID();
  await fs
    .setDoc(
      `users/${event.recipientUid}/notifications/${inAppNoticeId}`,
      {
        notificationId: inAppNoticeId,
        title: inAppTitle,
        body: inAppBody,
        deepLink: event.deepLink || "/producer",
        read: false,
        deliveryStatus: "delivered",
        createdAt: now,
        createdBy: "system:email_outbox",
      },
      { merge: true },
    )
    .catch((err) => {
      console.warn("[Outbox] In-app notification write warning:", err);
    });

  // 2. Prepare AI hook metadata
  const aiPayload = prepareAiAssistantEmailPayload(event, subject, textContent);

  // 3. Create initial outbox record
  const record: DurableOutboxRecord = {
    id: outboxId,
    eventType: event.eventType,
    recipientUid: event.recipientUid,
    recipientEmail: event.recipientEmail.trim().toLowerCase(),
    recipientName: event.recipientName || "",
    subject,
    textContent,
    htmlContent,
    status: "queued",
    attempts: 0,
    maxAttempts: 5,
    lastAttemptAt: null,
    nextAttemptAt: null,
    lastError: null,
    receiptUrl: event.receiptUrl || null,
    payload: event.metadata || {},
    aiHookMetadata: {
      hookName: "email_personalizer_v1",
      hookVersion: aiPayload.hookVersion,
      readyForAiPersonalization: true,
      documentedIn: "docs/DECISIONS.md#Batch-B7",
      eventType: event.eventType,
    },
    createdAt: now,
    updatedAt: now,
    sentAt: null,
  };

  await fs.setDoc(`email_outbox/${outboxId}`, record, { merge: true });

  // 4. Attempt immediate delivery
  return executeOutboxDelivery(fs, outboxId);
}

/**
 * Executes a single delivery attempt for an outbox item.
 */
export async function executeOutboxDelivery(
  fs: Firestore,
  outboxId: string,
): Promise<{ outboxId: string; status: OutboxItemStatus; error?: string }> {
  const doc = await fs.getDoc(`email_outbox/${outboxId}`);
  if (!doc) {
    throw new ApiError(404, "OUTBOX_ITEM_NOT_FOUND", "Email outbox record not found.");
  }

  const record = doc as unknown as DurableOutboxRecord;
  const newAttempts = (record.attempts || 0) + 1;
  const now = new Date();

  const apiKey = process.env["BREVO_API_KEY"]?.trim();
  const senderEmail = (process.env["BREVO_SENDER_EMAIL"] ?? "verification@bqsqwad.com").trim();
  const senderName = (process.env["BREVO_SENDER_NAME"] ?? "BQ SQWAD TV").trim();

  // If email delivery API key is not configured (e.g. test environment), mark queued or sent
  if (!apiKey) {
    // In unconfigured environments, record attempt without fatal crash
    const nextAttempt = new Date(now.getTime() + calculateNextBackoffMs(newAttempts)).toISOString();
    await fs.patchDoc(`email_outbox/${outboxId}`, {
      attempts: newAttempts,
      lastAttemptAt: now.toISOString(),
      nextAttemptAt: nextAttempt,
      status: "queued",
      lastError: "Email delivery credentials not configured (BREVO_API_KEY missing).",
      updatedAt: now.toISOString(),
    });
    return {
      outboxId,
      status: "queued",
      error: "BREVO_API_KEY missing",
    };
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: record.recipientEmail, name: record.recipientName || undefined }],
        subject: record.subject,
        textContent: record.textContent,
        htmlContent: record.htmlContent,
      }),
    });

    if (response.ok) {
      await fs.patchDoc(`email_outbox/${outboxId}`, {
        status: "sent",
        attempts: newAttempts,
        lastAttemptAt: now.toISOString(),
        sentAt: now.toISOString(),
        lastError: null,
        nextAttemptAt: null,
        updatedAt: now.toISOString(),
      });
      return { outboxId, status: "sent" };
    } else {
      const errText = await response.text();
      const isFinal = newAttempts >= record.maxAttempts;
      const nextAttempt = isFinal
        ? null
        : new Date(now.getTime() + calculateNextBackoffMs(newAttempts)).toISOString();
      const status: OutboxItemStatus = isFinal ? "failed" : "retried";

      await fs.patchDoc(`email_outbox/${outboxId}`, {
        status,
        attempts: newAttempts,
        lastAttemptAt: now.toISOString(),
        nextAttemptAt: nextAttempt,
        lastError: `Brevo HTTP ${response.status}: ${errText.slice(0, 500)}`,
        updatedAt: now.toISOString(),
      });
      return { outboxId, status, error: errText };
    }
  } catch (err: any) {
    const isFinal = newAttempts >= record.maxAttempts;
    const nextAttempt = isFinal
      ? null
      : new Date(now.getTime() + calculateNextBackoffMs(newAttempts)).toISOString();
    const status: OutboxItemStatus = isFinal ? "failed" : "retried";

    await fs.patchDoc(`email_outbox/${outboxId}`, {
      status,
      attempts: newAttempts,
      lastAttemptAt: now.toISOString(),
      nextAttemptAt: nextAttempt,
      lastError: err instanceof Error ? err.message : String(err),
      updatedAt: now.toISOString(),
    });
    return { outboxId, status, error: err.message };
  }
}
