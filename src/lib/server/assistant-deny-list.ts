import { ApiError } from "./firebase-admin";

/**
 * Rule A4 & Batch N26: Assistants are helpers, never actors.
 * Server-enforced deny list that assistant tools/helpers cannot bypass.
 *
 * Forbidden actions:
 * - never create channels or accounts
 * - never change revenue share, price, country, payout details, KYC results, roles or secrets
 * - never approve their own or anyone's change, or go live
 * - never bypass a password, PIN or step-up
 * - never reveal the name of the owner control centre or any internal detail
 */

export const FORBIDDEN_ASSISTANT_ACTIONS = [
  "create_channel",
  "create_account",
  "change_revenue_share",
  "change_price",
  "change_country",
  "change_payout_details",
  "change_kyc_result",
  "change_role",
  "change_secret",
  "change_storage",
  "approve_change",
  "go_live",
  "bypass_password",
  "bypass_pin",
  "bypass_step_up",
  "reveal_internal_details",
] as const;

export type ForbiddenAssistantAction = (typeof FORBIDDEN_ASSISTANT_ACTIONS)[number];

const FORBIDDEN_SET = new Set<string>(FORBIDDEN_ASSISTANT_ACTIONS);

const FORBIDDEN_FIELD_PATTERNS = [
  /^revenueShare/i,
  /^split/i,
  /^payoutAccount/i,
  /^bankDetails/i,
  /^kycStatus/i,
  /^verificationStatus/i,
  /^role/i,
  /^isOwner/i,
  /^permissions/i,
  /^price/i,
  /^ratePerMinute/i,
  /^countryCode/i,
  /^lockedCountry/i,
  /^secret/i,
  /^apiKey/i,
  /^password/i,
  /^pin/i,
  /^mfa/i,
  /^totp/i,
];

export function isAssistantActionForbidden(action: string): boolean {
  if (!action || typeof action !== "string") return true;
  const normalized = action.trim().toLowerCase().replace(/[- ]/g, "_");
  if (FORBIDDEN_SET.has(normalized)) return true;
  for (const forbidden of FORBIDDEN_SET) {
    if (normalized.includes(forbidden)) return true;
  }
  return false;
}

export function assertAssistantActionAllowed(action: string): void {
  if (isAssistantActionForbidden(action)) {
    throw new ApiError(
      403,
      "ASSISTANT_ACTION_FORBIDDEN",
      `Assistants are restricted helpers, never actors. The action "${action}" is forbidden under Rule A4.`,
    );
  }
}

export interface AssistantPreparedFix {
  targetType: "channel" | "stream" | "title" | "metadata" | "error_diagnostic";
  targetId: string;
  proposedChanges: Record<string, unknown>;
  explanation: string;
  diagnosticRef?: string;
}

export function validateAssistantPreparedFix(fix: AssistantPreparedFix): {
  valid: boolean;
  requiresChangeRequest: true;
  sanitizedChanges: Record<string, unknown>;
} {
  if (!fix.targetId || typeof fix.targetId !== "string") {
    throw new ApiError(400, "INVALID_TARGET", "A valid target ID is required for a prepared fix.");
  }
  if (!fix.proposedChanges || typeof fix.proposedChanges !== "object") {
    throw new ApiError(400, "INVALID_CHANGES", "Proposed changes must be a structured object.");
  }

  const sanitizedChanges: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fix.proposedChanges)) {
    const isForbiddenField = FORBIDDEN_FIELD_PATTERNS.some((pat) => pat.test(key));
    if (isForbiddenField) {
      throw new ApiError(
        403,
        "ASSISTANT_CHANGE_DISALLOWED",
        `Assistants may not modify protected field "${key}". This requires direct human action through authorized channels.`,
      );
    }
    sanitizedChanges[key] = value;
  }

  return {
    valid: true,
    requiresChangeRequest: true,
    sanitizedChanges,
  };
}
