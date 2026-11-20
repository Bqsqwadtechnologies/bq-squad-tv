import { describe, it, expect } from "vitest";

type CopyrightCaseStatus =
  | "pending_review"
  | "notice_issued"
  | "counter_notice_received"
  | "reinstated"
  | "takedown_upheld"
  | "settled";

interface CopyrightCaseStateMachine {
  status: CopyrightCaseStatus;
  history: { from: CopyrightCaseStatus; to: CopyrightCaseStatus; at: string }[];
}

function transitionCopyrightCase(
  current: CopyrightCaseStateMachine,
  next: CopyrightCaseStatus
): CopyrightCaseStateMachine {
  const allowedTransitions: Record<CopyrightCaseStatus, CopyrightCaseStatus[]> = {
    pending_review: ["notice_issued", "settled"],
    notice_issued: ["counter_notice_received", "takedown_upheld", "settled"],
    counter_notice_received: ["reinstated", "takedown_upheld", "settled"],
    reinstated: [],
    takedown_upheld: [],
    settled: [],
  };

  if (!allowedTransitions[current.status].includes(next)) {
    throw new Error(`Illegal copyright state transition from ${current.status} to ${next}`);
  }

  return {
    status: next,
    history: [
      ...current.history,
      { from: current.status, to: next, at: new Date().toISOString() },
    ],
  };
}

describe("Batch 12 Copyright Case State Machine", () => {
  it("allows standard notice -> counter-notice -> reinstatement workflow", () => {
    let item: CopyrightCaseStateMachine = {
      status: "pending_review",
      history: [],
    };

    item = transitionCopyrightCase(item, "notice_issued");
    expect(item.status).toBe("notice_issued");

    item = transitionCopyrightCase(item, "counter_notice_received");
    expect(item.status).toBe("counter_notice_received");

    item = transitionCopyrightCase(item, "reinstated");
    expect(item.status).toBe("reinstated");
    expect(item.history).toHaveLength(3);
  });

  it("blocks direct transition from pending_review to reinstated without due notice process", () => {
    const item: CopyrightCaseStateMachine = {
      status: "pending_review",
      history: [],
    };

    expect(() => transitionCopyrightCase(item, "reinstated")).toThrow(
      "Illegal copyright state transition from pending_review to reinstated"
    );
  });

  it("permits takedown uphold directly after notice", () => {
    let item: CopyrightCaseStateMachine = {
      status: "pending_review",
      history: [],
    };

    item = transitionCopyrightCase(item, "notice_issued");
    item = transitionCopyrightCase(item, "takedown_upheld");
    expect(item.status).toBe("takedown_upheld");
  });
});
