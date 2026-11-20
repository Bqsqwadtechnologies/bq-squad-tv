/**
 * Payout Calendar & Calculation Utilities
 * Platform policy: Payments are processed between the 30th and the 1st of each month.
 * Required notice: "Payouts are processed between the 30th and the 1st of each month; bank and international settlement may take longer."
 */

export const PAYOUT_WINDOW_DISCLOSURE =
  "Payouts are processed between the 30th and the 1st of each month; bank and international settlement may take longer.";

export type PayoutWindowInfo = {
  cycleStartIso: string; // e.g. 2026-11-30T00:00:00.000Z
  cycleEndIso: string;   // e.g. 2026-12-01T23:59:59.999Z
  nextPayoutDateFormatted: string; // e.g. "Nov 30, 2026 – Dec 1, 2026"
  isWindowActive: boolean;
  disclosure: string;
};

export function getNextPayoutWindow(referenceDate: Date = new Date()): PayoutWindowInfo {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth(); // 0-indexed
  const day = referenceDate.getUTCDate();

  let targetYear = year;
  let targetMonth = month;

  // If we are past the 1st of the month, the next payout window is the end of the current month (day 30)
  // If we are on day 30 or 31 or 1, the window is currently active!
  const isWindowActive = day >= 30 || day === 1;

  if (day > 1 && day < 30) {
    // Current month's window is upcoming at end of month
    targetYear = year;
    targetMonth = month;
  } else if (day === 1) {
    // Active window from previous month's day 30
    targetYear = month === 0 ? year - 1 : year;
    targetMonth = month === 0 ? 11 : month - 1;
  }

  // End of targetMonth (day 30)
  // To handle February safely, find last day of month or 30
  const daysInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const startDay = Math.min(30, daysInMonth);

  const startUtc = new Date(Date.UTC(targetYear, targetMonth, startDay, 0, 0, 0, 0));
  
  // End date is day 1 of following month
  const nextMonth = (targetMonth + 1) % 12;
  const nextYear = targetMonth === 11 ? targetYear + 1 : targetYear;
  const endUtc = new Date(Date.UTC(nextYear, nextMonth, 1, 23, 59, 59, 999));

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const formatted = `${monthNames[startUtc.getUTCMonth()]} ${startUtc.getUTCDate()}, ${startUtc.getUTCFullYear()} – ${monthNames[endUtc.getUTCMonth()]} ${endUtc.getUTCDate()}, ${endUtc.getUTCFullYear()}`;

  return {
    cycleStartIso: startUtc.toISOString(),
    cycleEndIso: endUtc.toISOString(),
    nextPayoutDateFormatted: formatted,
    isWindowActive,
    disclosure: PAYOUT_WINDOW_DISCLOSURE,
  };
}
