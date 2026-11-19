import { describe, expect, it } from "vitest";
import { isAdSuitableForViewer } from "@/lib/server/ads-policy";

describe("ad viewer suitability policy", () => {
  it("blocks adult-rated campaigns for viewers who are not adult eligible", () => {
    expect(
      isAdSuitableForViewer({ category: "entertainment", ageRating: "18+" }, false, "NG"),
    ).toBe(false);
    expect(
      isAdSuitableForViewer({ category: "entertainment", ageRating: "PG-13" }, false, "NG"),
    ).toBe(false);
    expect(isAdSuitableForViewer({ category: "entertainment", adultOnly: true }, false, "NG")).toBe(
      false,
    );
    expect(isAdSuitableForViewer({ category: "entertainment", ageRating: "18+" }, true, "NG")).toBe(
      true,
    );
  });

  it("fails closed on unrated campaigns for viewers who are not adult eligible", () => {
    expect(isAdSuitableForViewer({ category: "entertainment" }, false, "NG")).toBe(false);
  });

  it("blocks restricted ad categories for every viewer", () => {
    expect(isAdSuitableForViewer({ category: "sports betting" }, true, "NG")).toBe(false);
    expect(isAdSuitableForViewer({ category: "alcohol" }, true, "NG")).toBe(false);
  });

  it("requires the viewer country to match a restricted campaign", () => {
    const campaign = { category: "entertainment", ageRating: "PG", territoryCodes: ["NG", "GH"] };
    expect(isAdSuitableForViewer(campaign, false, "NG")).toBe(true);
    expect(isAdSuitableForViewer(campaign, false, "US")).toBe(false);
    expect(isAdSuitableForViewer(campaign, false, "")).toBe(false);
  });

  it("fails closed when a campaign has no category", () => {
    expect(isAdSuitableForViewer({ title: "Uncategorized campaign" }, true, "NG")).toBe(false);
  });
});
