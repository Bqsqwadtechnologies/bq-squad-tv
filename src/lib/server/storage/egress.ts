import { ApiError, Firestore } from "../firebase-admin";
import type { EgressLevel } from "./ledger";

/**
 * Segment-level accounting is deliberately retired. Expected delivery is
 * reserved at playback grant and extended by session heartbeats so a segment
 * request never reads account-wide storage or egress documents.
 */
export async function recordStorageEgress(
  fs: Firestore,
  destinationId: string,
  bytes: number,
  highResolution: boolean,
): Promise<EgressLevel> {
  void fs;
  void destinationId;
  void bytes;
  void highResolution;
  throw new ApiError(
    410,
    "EGRESS_USE_PLAYBACK_GRANTS",
    "Delivery allowances are recorded when playback starts and during session check-ins.",
  );
}
