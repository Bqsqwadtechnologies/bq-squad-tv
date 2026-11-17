export type DeliverySimulationResult = {
  viewers: number;
  durationSeconds: number;
  segmentRequests: number;
  segmentApiReads: number;
  playlistGenerations: number;
  storageSigningCalls: number;
  heartbeatCount: number;
  settlementTransactions: number;
  failovers: number;
  databaseReads: number;
  databaseWrites: number;
  outboundStorageCalls: number;
};

export function runDeliverySimulation(input: {
  viewers?: number;
  durationSeconds?: number;
  segmentsPerMinute?: number;
  failoverEvery?: number;
} = {}): DeliverySimulationResult {
  const viewers = input.viewers ?? 1_000;
  const durationSeconds = input.durationSeconds ?? 600;
  const segmentsPerMinute = input.segmentsPerMinute ?? 15;
  const failoverEvery = input.failoverEvery ?? 100;
  if (!Number.isSafeInteger(viewers) || viewers < 1 || viewers > 10_000 ||
      !Number.isSafeInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 86_400 ||
      !Number.isSafeInteger(segmentsPerMinute) || segmentsPerMinute < 1 ||
      !Number.isSafeInteger(failoverEvery) || failoverEvery < 1) {
    throw new Error("Simulation parameters are outside the safe test bounds.");
  }

  const playlistWindows = Math.ceil(durationSeconds / 1_800);
  const playlistGenerations = playlistWindows;
  const storageSigningCalls = playlistWindows * 3; // fake adapter: bounded batches, not one call per segment
  const heartbeatCountPerViewer = Math.ceil(durationSeconds / 30);
  const settlementBlocksPerViewer = Math.ceil(durationSeconds / 300);
  const segmentRequests = viewers * Math.ceil(durationSeconds / 60) * segmentsPerMinute;
  const failovers = Math.floor(viewers / failoverEvery);
  const heartbeatCount = viewers * heartbeatCountPerViewer;
  const settlementTransactions = viewers * settlementBlocksPerViewer;

  // Fake counters model session-start reads, heartbeat/settlement writes and
  // bounded playlist signing. Media bytes never traverse an API route.
  const databaseReads = viewers * 5 + heartbeatCount * 2 + settlementTransactions * 3;
  const databaseWrites = viewers * 2 + heartbeatCount + settlementTransactions * 2 + failovers;
  const outboundStorageCalls = storageSigningCalls + failovers * 1;

  return {
    viewers, durationSeconds, segmentRequests, segmentApiReads: 0,
    playlistGenerations, storageSigningCalls, heartbeatCount,
    settlementTransactions, failovers, databaseReads, databaseWrites,
    outboundStorageCalls,
  };
}
