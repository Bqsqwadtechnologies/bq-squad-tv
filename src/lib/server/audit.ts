import { ApiError, type Firestore } from "./firebase-admin";

export type AuditInput = {
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(fs: Firestore, input: AuditInput): Promise<string> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 1000) {
    throw new ApiError(400, "AUDIT_REASON_REQUIRED", "A reason of 3 to 1000 characters is required.");
  }
  if (!input.actorUid || !input.action || !input.targetType || !input.targetId) {
    throw new ApiError(400, "AUDIT_FIELDS_REQUIRED", "Audit actor, action and target are required.");
  }
  const id = crypto.randomUUID();
  await fs.setDoc(
    `auditLog/${id}`,
    {
      actorUid: input.actorUid,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason,
      ...(input.before === undefined ? {} : { before: input.before }),
      ...(input.after === undefined ? {} : { after: input.after }),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      createdAt: new Date().toISOString(),
    },
    { mustNotExist: true },
  );
  return id;
}
