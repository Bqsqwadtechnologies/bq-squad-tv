import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS, normalizePlatformFlags, publicFlags } from "./flags";

describe("platform flags", () => {
  it("provides conservative defaults when no configuration exists", () => {
    expect(normalizePlatformFlags(null)).toEqual(DEFAULT_FLAGS);
    expect(normalizePlatformFlags(undefined)).toEqual(DEFAULT_FLAGS);
  });

  it("accepts only boolean values for known flags", () => {
    expect(normalizePlatformFlags({
      waitingRoom: false,
      maintenanceMode: true,
      signupsOpen: "false",
      commentsOpen: 0,
      unknownInternalSetting: true,
    })).toEqual({
      ...DEFAULT_FLAGS,
      waitingRoom: false,
      maintenanceMode: true,
    });
  });

  it("exposes only the approved public flags", () => {
    const result = publicFlags({
      ...DEFAULT_FLAGS,
      producerChannelCreation: true,
    });
    expect(result).toEqual({
      waitingRoom: true,
      maintenanceMode: false,
      signupsOpen: true,
      commentsOpen: true,
      newStreamGrants: true,
      adultChannels: false,
    });
    expect(result).not.toHaveProperty("producerChannelCreation");
  });
});
