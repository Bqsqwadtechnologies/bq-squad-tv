import { ApiError, type Firestore } from "./firebase-admin";

export type FinancialApprovalStatus = "pending_second_approval" | "cooling_off" | "approved" | "cancelled";

export type FinancialActionRequest = {
  id: string;
  type: "payout_release" | "balance_adjustment";
  amount: number;
  currency: string;
  initiatedBy: string;
  initiatedAt: string;
  coolingOffExpiresAt?: string;
  firstApprovedBy: string;
  secondApprovedBy?: string;
  status: FinancialApprovalStatus;
  reason: string;
};

const HIGH_VALUE_THRESHOLD = 100.0; // In standard currency units

export async function requestFinancialAction(
  fs: Firestore,
  {
    type,
    amount,
    currency,
    actorUid,
    isSoloOwner,
    reason,
  }: {
    type: "payout_release" | "balance_adjustment";
    amount: number;
    currency: string;
    actorUid: string;
    isSoloOwner: boolean;
    reason: string;
  }
): Promise<FinancialActionRequest> {
  const now = new Date();
  const id = `fin_${type}_${Date.now()}`;

  // If below threshold, immediately approved
  if (amount <= HIGH_VALUE_THRESHOLD) {
    const action: FinancialActionRequest = {
      id,
      type,
      amount,
      currency,
      initiatedBy: actorUid,
      initiatedAt: now.toISOString(),
      firstApprovedBy: actorUid,
      status: "approved",
      reason,
    };
    await fs.setDoc(`financialActions/${id}`, action);
    return action;
  }

  // High-value action: requires 2-person approval or 30-min solo-owner cooling-off
  let status: FinancialApprovalStatus = "pending_second_approval";
  let coolingOffExpiresAt: string | undefined;

  if (isSoloOwner) {
    status = "cooling_off";
    // 30 minutes in ms = 30 * 60 * 1000 = 1,800,000 ms
    coolingOffExpiresAt = new Date(now.getTime() + 1800000).toISOString();
  }

  const action: FinancialActionRequest = {
    id,
    type,
    amount,
    currency,
    initiatedBy: actorUid,
    initiatedAt: now.toISOString(),
    coolingOffExpiresAt,
    firstApprovedBy: actorUid,
    status,
    reason,
  };

  await fs.setDoc(`financialActions/${id}`, action);
  return action;
}

export async function approveFinancialAction(
  fs: Firestore,
  actionId: string,
  approverUid: string
): Promise<FinancialActionRequest> {
  const doc = await fs.getDoc(`financialActions/${actionId}`);
  if (!doc) throw new ApiError(404, "ACTION_NOT_FOUND", "Financial action not found.");

  const action = doc as unknown as FinancialActionRequest;

  if (action.status === "cooling_off") {
    // If in cooling-off period, can execute once expired
    const now = Date.now();
    const expireTime = action.coolingOffExpiresAt ? new Date(action.coolingOffExpiresAt).getTime() : 0;
    if (now < expireTime) {
      throw new ApiError(
        403,
        "COOLING_OFF_ACTIVE",
        "This high-value action is in its mandatory 30-minute cooling-off period."
      );
    }
    action.status = "approved";
    await fs.updateDoc(`financialActions/${actionId}`, { status: "approved" });
    return action;
  }

  if (action.status === "pending_second_approval") {
    if (action.firstApprovedBy === approverUid) {
      throw new ApiError(
        403,
        "TWO_PERSON_REQUIRED",
        "Two distinct authorized signers are required for this transaction."
      );
    }
    action.secondApprovedBy = approverUid;
    action.status = "approved";
    await fs.updateDoc(`financialActions/${actionId}`, {
      secondApprovedBy: approverUid,
      status: "approved",
    });
    return action;
  }

  return action;
}
