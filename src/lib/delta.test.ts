import { describe, it, expect } from "vitest";
import { computeDelta } from "./delta";

describe("computeDelta", () => {
  it("shows nothing when both periods are missing or zero", () => {
    const res = computeDelta(0, 0);
    expect(res.formatted).toBeNull();
    expect(res.direction).toBe("none");
  });

  it("shows nothing when previous is null or undefined and current is 0", () => {
    const res = computeDelta(0, undefined);
    expect(res.formatted).toBeNull();
    expect(res.direction).toBe("none");
  });

  it("shows 'New' when previous is 0 and current > 0", () => {
    const res = computeDelta(150, 0);
    expect(res.formatted).toBe("New");
    expect(res.direction).toBe("new");
  });

  it("shows 'New' when previous is undefined and current > 0", () => {
    const res = computeDelta(25, undefined);
    expect(res.formatted).toBe("New");
    expect(res.direction).toBe("new");
  });

  it("computes positive percentage delta when previous > 0", () => {
    const res = computeDelta(120, 100, "vs last week");
    expect(res.formatted).toBe("+20%");
    expect(res.value).toBe(20);
    expect(res.direction).toBe("up");
    expect(res.positive).toBe(true);
    expect(res.caption).toBe("vs last week");
  });

  it("computes negative percentage delta when previous > 0", () => {
    const res = computeDelta(80, 100);
    expect(res.formatted).toBe("-20%");
    expect(res.value).toBe(-20);
    expect(res.direction).toBe("down");
    expect(res.positive).toBe(false);
  });

  it("handles decimal precision and rounding properly", () => {
    const res = computeDelta(114.2, 100);
    expect(res.formatted).toBe("+14.2%");
    expect(res.value).toBe(14.2);
  });

  it("never shows an arrow or colour for zero change or unchanged", () => {
    const res = computeDelta(100, 100);
    expect(res.formatted).toBeNull();
    expect(res.direction).toBe("neutral");
  });

  it("handles a brand new account with 0.00 balance with no delta", () => {
    const currentBalance = 0.0;
    const previousBalance = undefined;
    const delta = computeDelta(currentBalance, previousBalance);
    expect(delta.formatted).toBeNull();
    expect(delta.direction).toBe("none");
  });
});
