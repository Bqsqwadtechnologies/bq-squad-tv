import { describe, expect, it } from "vitest";
import { choosePlaybackLocation, nextHealthRecoveryState } from "./failover";

const location = (destinationId: string, healthStatus: string) => ({
  destinationId, healthStatus, mode: "active", enabled: true,
});

describe("storage playback failover", () => {
  it("uses the primary while healthy and a healthy replica when the primary fails", () => {
    const primary = location("b2-primary", "unreachable");
    const replicas = [location("lov-replica-1", "healthy")];
    expect(choosePlaybackLocation(primary, replicas)?.destinationId).toBe("lov-replica-1");
  });
  it("does not select disabled, draining or degraded replicas", () => {
    expect(choosePlaybackLocation(location("b2", "unreachable"), [
      { ...location("r1", "healthy"), mode: "drain" },
      { ...location("r2", "degraded"), mode: "active" },
    ])).toBeNull();
  });
  it("requires three consecutive clean checks before recovery", () => {
    let state = { status: "degraded", cleanChecks: 0 };
    state = nextHealthRecoveryState(state, "clean");
    expect(state.status).toBe("degraded");
    state = nextHealthRecoveryState(state, "clean");
    expect(state.status).toBe("degraded");
    state = nextHealthRecoveryState(state, "clean");
    expect(state.status).toBe("healthy");
    expect(nextHealthRecoveryState(state, "failed")).toEqual({ status: "degraded", cleanChecks: 0 });
  });
});
