import { ApiError } from "../firebase-admin";

export type PlaybackLocation = {
  destinationId: string;
  healthStatus: string;
  mode: string;
  enabled: boolean;
  degradedUntil?: string | null;
};

export function choosePlaybackLocation(
  primary: PlaybackLocation,
  replicas: PlaybackLocation[],
  now = Date.now(),
): PlaybackLocation | null {
  const usable = (item: PlaybackLocation) =>
    item.enabled &&
    item.mode === "active" &&
    (item.healthStatus === "healthy" ||
      (item.healthStatus === "unknown" && item.destinationId.startsWith("legacy_"))) &&
    !(typeof item.degradedUntil === "string" && Date.parse(item.degradedUntil) > now);
  if (usable(primary)) return primary;
  return replicas.find(usable) ?? null;
}

export function nextHealthRecoveryState(
  current: { status: string; cleanChecks?: number },
  check: "clean" | "failed",
): { status: string; cleanChecks: number } {
  if (check === "failed") return { status: "degraded", cleanChecks: 0 };
  const cleanChecks = Math.min(
    3,
    (Number.isSafeInteger(current.cleanChecks) ? current.cleanChecks! : 0) + 1,
  );
  return { status: cleanChecks >= 3 ? "healthy" : "degraded", cleanChecks };
}

export function requirePlaybackLocation(location: PlaybackLocation | null): PlaybackLocation {
  if (!location)
    throw new ApiError(
      503,
      "STREAM_REPLICAS_UNAVAILABLE",
      "This title is temporarily unavailable while its streaming locations are checked.",
    );
  return location;
}
