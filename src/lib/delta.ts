/**
 * Shared delta computation helper for KPI cards and metrics displays.
 *
 * Rules:
 * - Show a percentage only when BOTH periods have real data and previous > 0.
 * - If previous is 0 or data is missing show nothing (or "New" when current > 0).
 * - Never show an arrow or colour for zero or unchanged.
 * - Descriptive captions are allowed only if true and derived from real data.
 */

export interface DeltaResult {
  formatted: string | null;
  value: number | null;
  direction: "up" | "down" | "neutral" | "new" | "none";
  caption?: string;
  positive?: boolean;
}

export function computeDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  periodCaption?: string,
): DeltaResult {
  if (current === null || current === undefined || Number.isNaN(current)) {
    return {
      formatted: null,
      value: null,
      direction: "none",
    };
  }

  // If previous is 0 or missing
  if (previous === null || previous === undefined || Number.isNaN(previous) || previous <= 0) {
    if (current > 0) {
      return {
        formatted: "New",
        value: null,
        direction: "new",
        ...(periodCaption !== undefined ? { caption: periodCaption } : {}),
      };
    }
    return {
      formatted: null,
      value: null,
      direction: "none",
    };
  }

  const diff = current - previous;
  if (diff === 0) {
    return {
      formatted: null,
      value: 0,
      direction: "neutral",
      ...(periodCaption !== undefined ? { caption: periodCaption } : {}),
    };
  }

  const pct = (diff / previous) * 100;
  const rounded = Math.round(pct * 10) / 10;

  if (rounded === 0) {
    return {
      formatted: null,
      value: 0,
      direction: "neutral",
      ...(periodCaption !== undefined ? { caption: periodCaption } : {}),
    };
  }

  const sign = rounded > 0 ? "+" : "";
  const formatted = `${sign}${rounded.toFixed(1).replace(/\.0$/, "")}%`;

  return {
    formatted,
    value: rounded,
    direction: rounded > 0 ? "up" : "down",
    positive: rounded > 0,
    ...(periodCaption !== undefined ? { caption: periodCaption } : {}),
  };
}
