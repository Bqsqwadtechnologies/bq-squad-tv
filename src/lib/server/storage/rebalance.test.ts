import { describe, expect, it } from "vitest";
import { mayDeleteOldRebalanceCopy, nextRebalancePhase, chooseColdAssets } from "./rebalance";

describe("storage rebalance crash safety", () => {
  it("keeps the old copy until the new copy is verified and switched", () => {
    let phase = nextRebalancePhase("copy_pending", "copy_verified");
    expect(mayDeleteOldRebalanceCopy(phase, true)).toBe(false);
    phase = nextRebalancePhase(phase, "asset_switched");
    expect(mayDeleteOldRebalanceCopy(phase, true)).toBe(true);
    expect(nextRebalancePhase(phase, "old_copy_deleted")).toBe("deleted");
  });
  it("does not advance on failed copies", () => {
    expect(nextRebalancePhase("copy_pending", "copy_failed")).toBe("blocked");
    expect(mayDeleteOldRebalanceCopy("blocked", true)).toBe(false);
  });
  it("selects least recently watched content first", () => {
    const rows = [
      { id: "new", lastWatchedAt: "2026-11-16" },
      { id: "old", lastWatchedAt: "2026-01-01" },
    ];
    expect(chooseColdAssets(rows, 1).map((row) => row.id)).toEqual(["old"]);
  });
});
