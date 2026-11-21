/**
 * BQ SQWAD TV Pure Billing Engine
 * Zero imports, 100% exact BigInt arithmetic.
 * Never floats, never rounding drift.
 */

const SECONDS_PER_MINUTE = 60n;
const DEFAULT_BLOCK_SIZE_SECONDS = 300n; // 5-minute blocks
const DEFAULT_HOLD_MINUTES = 10n; // 10-minute hold
const BASIS_POINTS_DIVISOR = 10_000n;

/**
 * Calculates cumulative cost in integer minor units from rate per minute and accepted seconds.
 * Rounding: exact roundHalfUp: (rate * seconds + 30) / 60
 */
export function cumulativeCost(ratePerMinuteMinor: bigint, acceptedSeconds: bigint): bigint {
  if (ratePerMinuteMinor <= 0n || acceptedSeconds <= 0n) return 0n;
  const numerator = ratePerMinuteMinor * acceptedSeconds;
  return (numerator + SECONDS_PER_MINUTE / 2n) / SECONDS_PER_MINUTE;
}

/**
 * Calculates incremental cost between previous and next accepted seconds checkpoints.
 */
export function incrementalCost(
  ratePerMinuteMinor: bigint,
  prevAcceptedSeconds: bigint,
  nextAcceptedSeconds: bigint,
): bigint {
  if (nextAcceptedSeconds <= prevAcceptedSeconds) return 0n;
  return (
    cumulativeCost(ratePerMinuteMinor, nextAcceptedSeconds) -
    cumulativeCost(ratePerMinuteMinor, prevAcceptedSeconds)
  );
}

/**
 * Credits accepted billable seconds from a heartbeat interval, capping credit at 1.5x expected interval.
 */
export function creditAcceptedSeconds(
  reportedDeltaSeconds: bigint,
  expectedIntervalSeconds: bigint,
  isPlaying: boolean,
): bigint {
  if (!isPlaying || reportedDeltaSeconds <= 0n) return 0n;
  const maxCreditable = (expectedIntervalSeconds * 3n) / 2n; // 1.5x
  return reportedDeltaSeconds > maxCreditable ? maxCreditable : reportedDeltaSeconds;
}

/**
 * Checks if current accepted seconds crossed or reached a block boundary (every 300 seconds).
 */
export function calculateBlockBoundary(
  prevAcceptedSeconds: bigint,
  nextAcceptedSeconds: bigint,
  blockSizeSeconds: bigint = DEFAULT_BLOCK_SIZE_SECONDS,
): { isBlockBoundary: boolean; blockIndex: bigint; blockBoundarySeconds: bigint } {
  const prevBlock = prevAcceptedSeconds / blockSizeSeconds;
  const nextBlock = nextAcceptedSeconds / blockSizeSeconds;
  const isBlockBoundary = nextBlock > prevBlock;
  return {
    isBlockBoundary,
    blockIndex: nextBlock,
    blockBoundarySeconds: nextBlock * blockSizeSeconds,
  };
}

/**
 * Sizes the required wallet hold (default 10 minutes of viewing).
 */
export function calculateHoldSize(
  ratePerMinuteMinor: bigint,
  holdMinutes: bigint = DEFAULT_HOLD_MINUTES,
): bigint {
  return ratePerMinuteMinor * holdMinutes;
}

/**
 * Projects whether remaining balance or hold is approaching exhaustion (< 2 minutes remaining).
 */
export function projectLowBalance(
  currentBalanceMinor: bigint,
  ratePerMinuteMinor: bigint,
  lowBalanceThresholdMinutes: bigint = 2n,
): { isLowBalance: boolean; remainingSeconds: bigint } {
  if (ratePerMinuteMinor <= 0n) {
    return { isLowBalance: false, remainingSeconds: 86400n };
  }
  const remainingSeconds = (currentBalanceMinor * SECONDS_PER_MINUTE) / ratePerMinuteMinor;
  const thresholdSeconds = lowBalanceThresholdMinutes * SECONDS_PER_MINUTE;
  return {
    isLowBalance: remainingSeconds < thresholdSeconds,
    remainingSeconds,
  };
}

/**
 * Calculates producer/provider revenue split in integer minor units.
 * Platform retains the exact remainder.
 * Sum of shareMinor + platformMinor is guaranteed to equal grossRevenueMinor.
 */
export function calculateRevenueSplit(
  grossRevenueMinor: bigint,
  shareBps: bigint,
): { shareMinor: bigint; platformMinor: bigint } {
  if (grossRevenueMinor <= 0n || shareBps <= 0n) {
    return { shareMinor: 0n, platformMinor: grossRevenueMinor };
  }
  if (shareBps >= BASIS_POINTS_DIVISOR) {
    return { shareMinor: grossRevenueMinor, platformMinor: 0n };
  }
  const shareMinor = (grossRevenueMinor * shareBps) / BASIS_POINTS_DIVISOR;
  const platformMinor = grossRevenueMinor - shareMinor;
  return { shareMinor, platformMinor };
}

// ============================================================================
// BATCH 6: COLLABORATION & AUTOMATIC REVENUE SPLITTING
// Exact BigInt arithmetic, 10,000 basis points (100.00%), zero lost minor units
// ============================================================================

export type CollaboratorSplit = {
  uid: string;
  shareBps: bigint; // e.g., 7000n = 70.00%, 550n = 5.50%
  role?: string;
};

export type SplitResult = {
  uid: string;
  shareBps: bigint;
  allocatedMinor: bigint;
};

/**
 * Validates that collaborator split shares sum to exactly 10,000 basis points (100.00%)
 * and every active share is strictly positive.
 */
export function validateSplits(splits: readonly { shareBps: bigint }[]): boolean {
  if (!splits || splits.length === 0) return false;
  const sum = splits.reduce((acc, s) => acc + s.shareBps, 0n);
  return sum === 10_000n && splits.every((s) => s.shareBps > 0n);
}

/**
 * Splits gross revenue into platform share and producer pool.
 * Platform share percentage is defined strictly by the owner and never shown to producers.
 */
export function calculateProducerPool(
  grossMinor: bigint,
  platformShareBps: bigint,
): { producerMinor: bigint; platformMinor: bigint } {
  if (grossMinor <= 0n) return { producerMinor: 0n, platformMinor: 0n };
  const platformMinor = (grossMinor * platformShareBps) / 10_000n;
  const producerMinor = grossMinor - platformMinor;
  return { producerMinor, platformMinor };
}

/**
 * Splits the producer pool automatically among collaborators based on their agreed percentages.
 * Zero lost minor units: remainder due to integer division is assigned to the largest stakeholder.
 */
export function splitRevenueExact(
  totalProducerMinor: bigint,
  splits: readonly CollaboratorSplit[],
): SplitResult[] {
  if (!validateSplits(splits)) {
    throw new Error("Invalid splits: total basis points must equal 10,000 and all shares must be positive.");
  }
  if (totalProducerMinor <= 0n) {
    return splits.map((s) => ({ uid: s.uid, shareBps: s.shareBps, allocatedMinor: 0n }));
  }

  let totalAllocated = 0n;
  const results: SplitResult[] = [];

  for (const s of splits) {
    const share = (totalProducerMinor * s.shareBps) / 10_000n;
    totalAllocated += share;
    results.push({ uid: s.uid, shareBps: s.shareBps, allocatedMinor: share });
  }

  // Allocate any rounding remainder (no lost minor units) to the primary / largest collaborator
  const remainder = totalProducerMinor - totalAllocated;
  if (remainder > 0n && results.length > 0) {
    const largest = results.reduce<SplitResult | undefined>((max, result) =>
      !max || result.shareBps > max.shareBps ? result : max, undefined);
    if (largest) largest.allocatedMinor += remainder;
  }

  return results;
}
