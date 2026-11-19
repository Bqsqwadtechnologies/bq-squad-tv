import { ApiError } from "./firebase-admin";

function minor(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ApiError(
      400,
      "WALLET_HOLD_AMOUNT_INVALID",
      name + " must be a non-negative integer in minor units.",
    );
  }
  return value;
}

export function initialSessionHold(
  balanceMinor: number,
  heldBalanceMinor: number,
  targetHoldMinor: number,
): { holdMinor: number; heldBalanceMinor: number } {
  const balance = minor(balanceMinor, "Wallet balance");
  const held = minor(heldBalanceMinor, "Existing wallet holds");
  const target = minor(targetHoldMinor, "Target wallet hold");
  if (held > balance) {
    throw new ApiError(
      409,
      "WALLET_HOLD_INVARIANT_BROKEN",
      "Existing wallet holds exceed the available balance.",
    );
  }
  const holdMinor = Math.min(target, balance - held);
  return { holdMinor, heldBalanceMinor: held + holdMinor };
}

export function sessionSpendableBalance(
  balanceMinor: number,
  heldBalanceMinor: number,
  ownHoldMinor: number,
): number {
  const balance = minor(balanceMinor, "Wallet balance");
  const held = minor(heldBalanceMinor, "Existing wallet holds");
  const own = minor(ownHoldMinor, "This session's wallet hold");
  if (held > balance || own > held) {
    throw new ApiError(
      409,
      "WALLET_HOLD_INVARIANT_BROKEN",
      "The wallet hold totals are inconsistent.",
    );
  }
  return Math.max(0, balance - (held - own));
}

export function settleSessionHold(input: {
  balanceMinor: number;
  heldBalanceMinor: number;
  ownHoldMinor: number;
  chargeMinor: number;
  targetHoldMinor: number;
  keepActive: boolean;
}): { holdMinor: number; heldBalanceMinor: number } {
  const balance = minor(input.balanceMinor, "Wallet balance");
  const held = minor(input.heldBalanceMinor, "Existing wallet holds");
  const own = minor(input.ownHoldMinor, "This session's wallet hold");
  const charge = minor(input.chargeMinor, "Session charge");
  const target = minor(input.targetHoldMinor, "Target wallet hold");
  if (held > balance || own > held || charge > balance) {
    throw new ApiError(
      409,
      "WALLET_HOLD_INVARIANT_BROKEN",
      "The wallet hold totals are inconsistent.",
    );
  }
  const otherHolds = held - own;
  const balanceAfterCharge = balance - charge;
  if (!input.keepActive) return { holdMinor: 0, heldBalanceMinor: otherHolds };
  const ownAfterCharge = Math.max(0, own - charge);
  const availableAfterCharge = Math.max(0, balanceAfterCharge - otherHolds - ownAfterCharge);
  const topUp = Math.min(Math.max(0, target - ownAfterCharge), availableAfterCharge);
  const holdMinor = ownAfterCharge + topUp;
  return { holdMinor, heldBalanceMinor: otherHolds + holdMinor };
}
