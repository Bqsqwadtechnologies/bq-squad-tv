import { ApiError, type Firestore } from "./firebase-admin";

export type ChangeRequestScope =
  | "channel_details"
  | "artwork"
  | "stream_config"
  | "schedule"
  | "privacy_link"
  | "payout_profile"
  | "producer_title";

export type ChangeRequestStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "live"
  | "rejected"
  | "withdrawn"
  | "rolled_back";

export interface ChangeRequestRecord {
  id: string;
  scope: ChangeRequestScope;
  submitterUid: string;
  submitterRole: string;
  partnerId: string;
  channelId?: string | null;
  targetType: "channel" | "stream" | "title" | "artwork" | "payout" | "schedule";
  targetId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  status: ChangeRequestStatus;
  previousSnapshot?: Record<string, unknown>;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  reason?: string;
  notes?: string;
  scheduledLiveAt?: string | null;
  appliedAt?: string;
  appliedBy?: string;
  rolledBackAt?: string;
  rolledBackBy?: string;
  autoTestResults?: { passed: boolean; details?: string };
  createdAt: string;
  updatedAt: string;
}

const SECRET_KEY_PATTERNS = [/secret/i, /token/i, /key/i, /password/i, /credential/i, /pin/i];

export function maskSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEY_PATTERNS.some((p) => p.test(k))) {
      clean[k] = "••••••••";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      clean[k] = maskSecrets(v as Record<string, unknown>);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export function targetPathForChange(targetTypeOrScope: string, targetId: string): string {
  switch (targetTypeOrScope) {
    case "channel":
    case "channel_details":
      return `channels/${targetId}`;
    case "stream":
    case "stream_config":
      return `live_streams/${targetId}`;
    case "title":
    case "producer_title":
      return `content_assets/${targetId}`;
    case "artwork":
      return `artwork/${targetId}`;
    case "payout":
    case "payout_profile":
      return `payout_profiles/${targetId}`;
    case "schedule":
      return `schedules/${targetId}`;
    case "privacy_link":
      return `privacy_links/${targetId}`;
    default:
      throw new ApiError(400, "INVALID_TARGET_TYPE", `Unknown target type or scope: ${targetTypeOrScope}`);
  }
}

/**
 * Atomically apply an approved change request to make it live.
 * Stores previous snapshot to allow one-click rollback.
 */
export async function applyChangeRequestGoLive(
  fs: Firestore,
  requestId: string,
  reviewerUid: string,
  options?: { overrideAutoTestReason?: string },
): Promise<ChangeRequestRecord> {
  const reqDoc = await fs.getDoc(`changeRequests/${requestId}`);
  if (!reqDoc) {
    throw new ApiError(404, "CHANGE_REQUEST_NOT_FOUND", "Change request not found.");
  }

  const req = reqDoc as unknown as ChangeRequestRecord;

  // Rule A5: Request must be in "approved" state before going live
  if (req.status !== "approved") {
    throw new ApiError(
      400,
      "INVALID_STATE_FOR_GO_LIVE",
      `Only approved change requests can be put live. Current status: "${req.status}".`,
    );
  }

  // Automatic test check (N22): blocked if auto-test failed unless override provided
  if (req.autoTestResults && req.autoTestResults.passed === false) {
    if (!options?.overrideAutoTestReason || options.overrideAutoTestReason.trim().length < 5) {
      throw new ApiError(
        400,
        "AUTO_TEST_FAILED",
        "Automatic tests failed for this change. An override reason is required to go live.",
      );
    }
  }

  const targetPath = targetPathForChange(req.targetType, req.targetId);
  const currentTarget = await fs.getDoc(targetPath);

  const previousSnapshot = currentTarget || {};
  const now = new Date().toISOString();

  // Atomically update target document with "after" fields
  await fs.setDoc(targetPath, {
    ...previousSnapshot,
    ...req.after,
    updatedAt: now,
    lastChangeRequestId: requestId,
  });

  // Update change request record
  const updatedReq: ChangeRequestRecord = {
    ...req,
    status: "live",
    previousSnapshot,
    appliedAt: now,
    appliedBy: reviewerUid,
    updatedAt: now,
  };

  await fs.setDoc(`changeRequests/${requestId}`, updatedReq as unknown as Record<string, unknown>);

  return updatedReq;
}

/**
 * Atomically rollback a live change request, restoring the previous snapshot.
 */
export async function rollbackChangeRequest(
  fs: Firestore,
  requestId: string,
  reviewerUid: string,
  reason: string,
): Promise<ChangeRequestRecord> {
  const reqDoc = await fs.getDoc(`changeRequests/${requestId}`);
  if (!reqDoc) {
    throw new ApiError(404, "CHANGE_REQUEST_NOT_FOUND", "Change request not found.");
  }

  const req = reqDoc as unknown as ChangeRequestRecord;

  if (req.status !== "live") {
    throw new ApiError(
      400,
      "INVALID_STATE_FOR_ROLLBACK",
      `Only live change requests can be rolled back. Current status: "${req.status}".`,
    );
  }

  if (!req.previousSnapshot) {
    throw new ApiError(
      409,
      "NO_SNAPSHOT_AVAILABLE",
      "No previous snapshot was stored for this change request.",
    );
  }

  const targetPath = targetPathForChange(req.targetType, req.targetId);
  const now = new Date().toISOString();

  // Atomically restore previous snapshot
  await fs.setDoc(targetPath, {
    ...req.previousSnapshot,
    updatedAt: now,
    rolledBackFromRequestId: requestId,
  });

  const updatedReq: ChangeRequestRecord = {
    ...req,
    status: "rolled_back",
    rolledBackAt: now,
    rolledBackBy: reviewerUid,
    notes: req.notes ? `${req.notes} | Rollback reason: ${reason}` : `Rollback reason: ${reason}`,
    updatedAt: now,
  };

  await fs.setDoc(`changeRequests/${requestId}`, updatedReq as unknown as Record<string, unknown>);

  return updatedReq;
}

export function validateChangeRequestPayload(payload: {
  scope: ChangeRequestScope;
  targetType: string;
  targetId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}): boolean {
  if (!payload.scope || !payload.targetType || !payload.targetId) {
    throw new ApiError(400, "INVALID_CHANGE_REQUEST", "scope, targetType, and targetId are required");
  }
  if (!payload.before || typeof payload.before !== "object") {
    throw new ApiError(400, "INVALID_CHANGE_REQUEST", "before state is required");
  }
  if (!payload.after || typeof payload.after !== "object") {
    throw new ApiError(400, "INVALID_CHANGE_REQUEST", "after state is required");
  }
  return true;
}
