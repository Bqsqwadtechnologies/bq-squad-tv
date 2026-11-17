import { describe, expect, it } from "vitest";
import { visibleChannels } from "./-shared";

describe("catalogue adult visibility", () => {
  const channels = [
    { __id: "general", published: true, adultOnly: false },
    { __id: "adult", published: true, adultOnly: true },
    { __id: "unpublished", published: false, adultOnly: false },
  ];

  it("removes adult-only and unpublished channels for non-adult viewers", () => {
    expect(visibleChannels(channels, false).map(channel => channel.__id)).toEqual(["general"]);
  });

  it("still removes unpublished channels for verified adult viewers", () => {
    expect(visibleChannels(channels, true).map(channel => channel.__id)).toEqual(["general", "adult"]);
  });
});
