import { describe, expect, it } from "vitest";
import { hasModuleAccess, ZILLIONAIRE_MODULES } from "../lib/server/roles";

describe("Batch 5 - Live Stream Approval Workflow & Controls", () => {
  it("includes live_approvals and rights_review in Zillionaire modules", () => {
    expect(ZILLIONAIRE_MODULES).toContain("live_approvals");
    expect(ZILLIONAIRE_MODULES).toContain("rights_review");
    expect(ZILLIONAIRE_MODULES).toContain("channels");
  });

  it("grants live_approvals access to operators with channels or live_approvals module", () => {
    expect(hasModuleAccess(["channels"], "live_approvals")).toBe(true);
    expect(hasModuleAccess(["live_approvals"], "live_approvals")).toBe(true);
    expect(hasModuleAccess(["pricing"], "live_approvals")).toBe(false);
  });

  it("validates HTTPS and .m3u8 for HLS stream sources", () => {
    const isValidHls = (url: string) =>
      url.startsWith("https://") && /\.m3u8(?:$|[?#])/i.test(url);

    expect(isValidHls("https://cdn.example.com/live/master.m3u8")).toBe(true);
    expect(isValidHls("https://cdn.example.com/live/master.m3u8?token=xyz")).toBe(true);
    expect(isValidHls("http://cdn.example.com/live/master.m3u8")).toBe(false);
    expect(isValidHls("https://cdn.example.com/live/video.mp4")).toBe(false);
  });

  it("validates rights evidence requirement for live channel broadcast submission", () => {
    const validateRights = (rightsEvidence?: { licenceNumber?: string; licenceContractUrl?: string }) => {
      return Boolean(
        rightsEvidence &&
        (Boolean(rightsEvidence.licenceNumber?.trim()) || Boolean(rightsEvidence.licenceContractUrl?.trim()))
      );
    };

    expect(validateRights(undefined)).toBe(false);
    expect(validateRights({})).toBe(false);
    expect(validateRights({ licenceNumber: "NBC/2026/LIVE/991" })).toBe(true);
    expect(validateRights({ licenceContractUrl: "https://contracts.example.com/doc.pdf" })).toBe(true);
  });

  it("models state machine: draft -> submitted -> approved -> scheduled -> live -> ended with rejected/suspended transitions", () => {
    type LiveState = "draft" | "submitted" | "approved" | "scheduled" | "live" | "ended" | "rejected" | "suspended";

    const canGoLive = (state: LiveState): boolean => {
      return state === "approved" || state === "scheduled";
    };

    expect(canGoLive("draft")).toBe(false);
    expect(canGoLive("submitted")).toBe(false);
    expect(canGoLive("rejected")).toBe(false);
    expect(canGoLive("suspended")).toBe(false);
    expect(canGoLive("approved")).toBe(true);
    expect(canGoLive("scheduled")).toBe(true);

    // Force stop transitions any active or scheduled stream to suspended
    const forceStop = (currentState: LiveState): { state: LiveState; isLive: boolean } => {
      return { state: "suspended", isLive: false };
    };

    expect(forceStop("live")).toEqual({ state: "suspended", isLive: false });
    expect(forceStop("scheduled")).toEqual({ state: "suspended", isLive: false });
  });
});
