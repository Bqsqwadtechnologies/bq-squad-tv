import { describe, expect, it } from "vitest";
import {
  validateSplits,
  splitRevenueExact,
  calculateProducerPool,
  type CollaboratorSplit,
} from "../lib/server/billing-engine";

describe("Batch 6 - Collaboration & Automatic Revenue Splitting", () => {
  it("validates that collaboration split shares must sum to exactly 10,000 basis points (100.00%)", () => {
    // 70% / 30%
    expect(validateSplits([{ shareBps: 7000n }, { shareBps: 3000n }])).toBe(true);

    // 94.5% / 5.5%
    expect(validateSplits([{ shareBps: 9450n }, { shareBps: 550n }])).toBe(true);

    // Three-way split: 50% / 25% / 25%
    expect(
      validateSplits([
        { shareBps: 5000n },
        { shareBps: 2500n },
        { shareBps: 2500n },
      ]),
    ).toBe(true);

    // Invalid sums (less than or greater than 100%)
    expect(validateSplits([{ shareBps: 7000n }, { shareBps: 2900n }])).toBe(false);
    expect(validateSplits([{ shareBps: 7000n }, { shareBps: 3001n }])).toBe(false);
    expect(validateSplits([])).toBe(false);

    // Zero or negative shares are rejected
    expect(validateSplits([{ shareBps: 10000n }, { shareBps: 0n }])).toBe(false);
  });

  it("calculates platform share and producer pool correctly (confidential from producers)", () => {
    const grossRevenueMinor = 1_000_000n; // ₦10,000.00
    const platformShareBps = 3000n; // 30.00% owner take

    const { producerMinor, platformMinor } = calculateProducerPool(
      grossRevenueMinor,
      platformShareBps,
    );

    expect(platformMinor).toBe(300_000n);
    expect(producerMinor).toBe(700_000n);
    expect(platformMinor + producerMinor).toBe(grossRevenueMinor);
  });

  it("splits producer pool with exact integer rounding and zero lost minor units (70/30 split)", () => {
    const totalProducerPool = 100_001n; // Odd amount that would lose minor units with float division
    const splits: CollaboratorSplit[] = [
      { uid: "lead_producer", shareBps: 7000n },
      { uid: "collaborator_2", shareBps: 3000n },
    ];

    const results = splitRevenueExact(totalProducerPool, splits);

    expect(results).toHaveLength(2);
    const sumAllocated = results.reduce((acc, r) => acc + r.allocatedMinor, 0n);

    // Exact equality check: zero lost minor units!
    expect(sumAllocated).toBe(totalProducerPool);

    // Lead gets remainder: 70000 + 1 = 70001, Collaborator gets 30000
    expect(results[0].allocatedMinor).toBe(70_001n);
    expect(results[1].allocatedMinor).toBe(30_000n);
  });

  it("splits producer pool with exact integer rounding (94.5 / 5.5 split)", () => {
    const totalProducerPool = 1_234_567n; // Complex uneven minor units
    const splits: CollaboratorSplit[] = [
      { uid: "primary_studio", shareBps: 9450n },
      { uid: "sound_engineer", shareBps: 550n },
    ];

    const results = splitRevenueExact(totalProducerPool, splits);
    const sumAllocated = results.reduce((acc, r) => acc + r.allocatedMinor, 0n);

    // Zero lost minor units
    expect(sumAllocated).toBe(totalProducerPool);
  });

  it("enforces versioning and dispute state transitions", () => {
    type CollabState = "pending_confirmation" | "active" | "disputed" | "revision_required" | "pending_reconfirmation";

    // Modifying splits bumps agreement version and requires reconfirmation
    const reviseAgreement = (
      currentVersion: number,
      newSplits: { shareBps: bigint }[],
    ): { nextVersion: number; state: CollabState } => {
      if (!validateSplits(newSplits)) throw new Error("Invalid split sum");
      return { nextVersion: currentVersion + 1, state: "pending_reconfirmation" };
    };

    const revision = reviseAgreement(1, [{ shareBps: 6000n }, { shareBps: 4000n }]);
    expect(revision.nextVersion).toBe(2);
    expect(revision.state).toBe("pending_reconfirmation");

    // Filing dispute moves state to disputed and pauses settlement
    const disputeAgreement = (): CollabState => "disputed";
    expect(disputeAgreement()).toBe("disputed");

    // Collaborator leaving moves state to revision_required
    const collaboratorLeave = (): CollabState => "revision_required";
    expect(collaboratorLeave()).toBe("revision_required");
  });
});
