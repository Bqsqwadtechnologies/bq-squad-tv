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
  nextAcceptedSeconds: bigint
): bigint {
  if (nextAcceptedSeconds <= prevAcceptedSeconds) return 0n;
  return cumulativeCost(ratePerMinuteMinor, nextAcceptedSeconds) - cumulativeCost(ratePerMinuteMinor, prevAcceptedSeconds);
}

/**
 * Credits accepted billable seconds from a heartbeat interval, capping credit at 1.5x expected interval.
 */
export function creditAcceptedSeconds(
  reportedDeltaSeconds: bigint,
  expectedIntervalSeconds: bigint,
  isPlaying: boolean
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
  blockSizeSeconds: bigint = DEFAULT_BLOCK_SIZE_SECONDS
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
  holdMinutes: bigint = DEFAULT_HOLD_MINUTES
): bigint {
  return ratePerMinuteMinor * holdMinutes;
}

/**
 * Projects whether remaining balance or hold is approaching exhaustion (< 2 minutes remaining).
 */
export function projectLowBalance(
  currentBalanceMinor: bigint,
  ratePerMinuteMinor: bigint,
  lowBalanceThresholdMinutes: bigint = 2n
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
  shareBps: bigint
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
