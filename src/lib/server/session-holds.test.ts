import { describe, expect, it } from "vitest";
import { initialSessionHold, sessionSpendableBalance, settleSessionHold } from "./session-holds";

describe("pay-as-you-go session wallet holds", () => {
  it("reserves only unheld funds and caps the initial ten-minute block", () => {
    expect(initialSessionHold(5_000, 1_500, 2_000)).toEqual({
      holdMinor: 2_000,
      heldBalanceMinor: 3_500,
    });
    expect(initialSessionHold(2_000, 1_500, 2_000)).toEqual({
      holdMinor: 500,
      heldBalanceMinor: 2_000,
    });
  });

  it("protects other sessions' holds while allowing this session to spend its own", () => {
    expect(sessionSpendableBalance(10_000, 6_000, 2_000)).toBe(6_000);
    expect(sessionSpendableBalance(3_000, 3_000, 1_000)).toBe(1_000);
  });

  it("settles a debit, replenishes the current hold only from unreserved balance", () => {
    expect(settleSessionHold({
      balanceMinor: 10_000,
      heldBalanceMinor: 6_000,
      ownHoldMinor: 2_000,
      chargeMinor: 500,
      targetHoldMinor: 2_000,
      keepActive: true,
    })).toEqual({ holdMinor: 2_000, heldBalanceMinor: 6_000 });
    expect(settleSessionHold({
      balanceMinor: 6_000,
      heldBalanceMinor: 6_000,
      ownHoldMinor: 2_000,
      chargeMinor: 1_500,
      targetHoldMinor: 2_000,
      keepActive: true,
    })).toEqual({ holdMinor: 500, heldBalanceMinor: 4_500 });
  });

  it("releases this session's hold when playback ends", () => {
    expect(settleSessionHold({
      balanceMinor: 5_000,
      heldBalanceMinor: 3_000,
      ownHoldMinor: 1_000,
      chargeMinor: 250,
      targetHoldMinor: 1_000,
      keepActive: false,
    })).toEqual({ holdMinor: 0, heldBalanceMinor: 2_000 });
  });

  it("rejects inconsistent hold totals and negative amounts", () => {
    expect(() => sessionSpendableBalance(1_000, 1_200, 100)).toThrow();
    expect(() => sessionSpendableBalance(1_000, 500, 600)).toThrow();
    expect(() => initialSessionHold(1_000, -1, 100)).toThrow();
  });
});
