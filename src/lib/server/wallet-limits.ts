import { ApiError } from "./firebase-admin";

export type LimitChange = {
  dailyLimitMinor: number;
  pendingDailyLimitMinor: number | null;
  pendingEffectiveAt: string | null;
};

export function requestDailyLimitChange(input: {
  currentLimitMinor: number;
  requestedLimitMinor: number;
  nowMs?: number;
  coolingOffMs?: number;
}): LimitChange {
  const { currentLimitMinor, requestedLimitMinor } = input;
  if (
    ![currentLimitMinor, requestedLimitMinor].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    )
  ) {
    throw new ApiError(
      400,
      "DAILY_LIMIT_INVALID",
      "Daily limits must be whole minor currency units.",
    );
  }
  if (requestedLimitMinor <= currentLimitMinor) {
    return {
      dailyLimitMinor: requestedLimitMinor,
      pendingDailyLimitMinor: null,
      pendingEffectiveAt: null,
    };
  }
  const now = input.nowMs ?? Date.now();
  const coolingOff = input.coolingOffMs ?? 24 * 60 * 60 * 1000;
  if (
    !Number.isSafeInteger(now) ||
    !Number.isSafeInteger(coolingOff) ||
    coolingOff < 60 * 60 * 1000
  ) {
    throw new ApiError(
      400,
      "DAILY_LIMIT_COOLING_OFF_INVALID",
      "The limit-change waiting period is invalid.",
    );
  }
  return {
    dailyLimitMinor: currentLimitMinor,
    pendingDailyLimitMinor: requestedLimitMinor,
    pendingEffectiveAt: new Date(now + coolingOff).toISOString(),
  };
}

export function monthlyBudgetStatus(input: {
  budgetMinor: number | null;
  spentMinor: number;
  currency: string;
}): { enabled: boolean; remainingMinor: number | null; crossed: boolean } {
  if (
    !/^[A-Z]{3}$/.test(input.currency) ||
    !Number.isSafeInteger(input.spentMinor) ||
    input.spentMinor < 0 ||
    (input.budgetMinor !== null &&
      (!Number.isSafeInteger(input.budgetMinor) || input.budgetMinor < 0))
  ) {
    throw new ApiError(400, "MONTHLY_BUDGET_INVALID", "The monthly budget details are invalid.");
  }
  if (input.budgetMinor === null) return { enabled: false, remainingMinor: null, crossed: false };
  return {
    enabled: true,
    remainingMinor: Math.max(0, input.budgetMinor - input.spentMinor),
    crossed: input.spentMinor >= input.budgetMinor,
  };
}

export function shouldSendBudgetAlert(input: {
  crossed: boolean;
  alreadyAlertedForPeriod: boolean;
}): boolean {
  return input.crossed && !input.alreadyAlertedForPeriod;
}
