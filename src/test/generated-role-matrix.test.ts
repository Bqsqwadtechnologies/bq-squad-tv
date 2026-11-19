import { describe, expect, it } from "vitest";
// @ts-expect-error - dynamic build script import without d.ts
import { buildMatrix } from "../../scripts/route-access-matrix.mjs";

type GuardClass =
  | "public"
  | "viewer"
  | "zillionaire module"
  | "producer"
  | "provider"
  | "worker signature"
  | "webhook signature"
  | "playback token";

type MatrixRoute = { route: string; file: string; type: GuardClass; details: string };
type Caller =
  | "anonymous"
  | "viewer"
  | "producer A"
  | "producer B"
  | "provider A"
  | "provider B"
  | "delegate with module"
  | "delegate without module"
  | "worker"
  | "owner";

const CALLERS: Caller[] = [
  "anonymous",
  "viewer",
  "producer A",
  "producer B",
  "provider A",
  "provider B",
  "delegate with module",
  "delegate without module",
  "worker",
  "owner",
];

// Expected HTTP result for the route's primary authorization guard. Each route
// discovered by the inventory must have an explicit row for every caller.
const EXPECTED_STATUS: Record<GuardClass, Record<Caller, number>> = {
  public: {
    anonymous: 200,
    viewer: 200,
    "producer A": 200,
    "producer B": 200,
    "provider A": 200,
    "provider B": 200,
    "delegate with module": 200,
    "delegate without module": 200,
    worker: 200,
    owner: 200,
  },
  viewer: {
    anonymous: 401,
    viewer: 200,
    "producer A": 200,
    "producer B": 200,
    "provider A": 200,
    "provider B": 200,
    "delegate with module": 200,
    "delegate without module": 200,
    worker: 401,
    owner: 200,
  },
  "zillionaire module": {
    anonymous: 401,
    viewer: 403,
    "producer A": 403,
    "producer B": 403,
    "provider A": 403,
    "provider B": 403,
    "delegate with module": 200,
    "delegate without module": 403,
    worker: 401,
    owner: 200,
  },
  producer: {
    anonymous: 401,
    viewer: 403,
    "producer A": 200,
    "producer B": 200,
    "provider A": 403,
    "provider B": 403,
    "delegate with module": 403,
    "delegate without module": 403,
    worker: 401,
    owner: 403,
  },
  provider: {
    anonymous: 401,
    viewer: 403,
    "producer A": 403,
    "producer B": 403,
    "provider A": 200,
    "provider B": 200,
    "delegate with module": 403,
    "delegate without module": 403,
    worker: 401,
    owner: 403,
  },
  "worker signature": {
    anonymous: 401,
    viewer: 401,
    "producer A": 401,
    "producer B": 401,
    "provider A": 401,
    "provider B": 401,
    "delegate with module": 401,
    "delegate without module": 401,
    worker: 200,
    owner: 401,
  },
  "webhook signature": {
    anonymous: 401,
    viewer: 401,
    "producer A": 401,
    "producer B": 401,
    "provider A": 401,
    "provider B": 401,
    "delegate with module": 401,
    "delegate without module": 401,
    worker: 401,
    owner: 401,
  },
  "playback token": {
    anonymous: 401,
    viewer: 200,
    "producer A": 200,
    "producer B": 200,
    "provider A": 200,
    "provider B": 200,
    "delegate with module": 200,
    "delegate without module": 200,
    worker: 401,
    owner: 200,
  },
};

type ExpectedRoute = {
  route: string;
  file: string;
  guard: GuardClass;
  expected: Record<Caller, number>;
};
type ExpectedRouteCase = ExpectedRoute & { caller: Caller; expectedStatus: number };

// This reviewed fixture is intentionally committed instead of generated during
// the test. A new/changed route fails until its caller expectations are reviewed.
import expectedCases from "./fixtures/role-matrix-routes.json";

const routeKey = (route: Pick<MatrixRoute, "route" | "file">) =>
  `${route.route}\u0000${route.file}`;
const discovered = buildMatrix() as MatrixRoute[];
const matrix = [...new Map(discovered.map((route) => [routeKey(route), route])).values()];
const expectedRoutes = expectedCases as ExpectedRoute[];
const cases = expectedRoutes.flatMap((route) =>
  CALLERS.map((caller) => ({ ...route, caller, expectedStatus: route.expected[caller] })),
);

describe("Generated route-family role matrix", () => {
  it("has explicit expected rows for every discovered route and caller", () => {
    const discoveredRoutes = new Set(matrix.map(routeKey));
    const expectedRouteKeys = new Set(expectedRoutes.map(routeKey));
    const missingRows = matrix
      .filter((route) => !expectedRouteKeys.has(routeKey(route)))
      .map(({ route, file }) => `${route} (${file})`);
    const staleRows = expectedRoutes
      .filter((item) => !discoveredRoutes.has(routeKey(item)))
      .map(({ route, file }) => `${route} (${file})`);

    expect(missingRows, "New routes require reviewed caller/status rows").toEqual([]);
    expect(staleRows, "Remove expectations for routes no longer in the inventory").toEqual([]);
    expect(expectedRoutes).toHaveLength(matrix.length);
    expect(cases).toHaveLength(matrix.length * CALLERS.length);
  });

  it.each(cases)("$caller receives $expectedStatus for $route ($guard)", (row) => {
    expect(CALLERS).toContain(row.caller);
    expect(row.expectedStatus).toBe(EXPECTED_STATUS[row.guard][row.caller]);
    const discovered = matrix.find((route) => route.route === row.route && route.file === row.file);
    expect(discovered?.type).toBe(row.guard);
  });

  it("covers every caller for each route exactly once", () => {
    const grouped = new Map<string, ExpectedRouteCase[]>();
    for (const row of cases) {
      const key = routeKey(row);
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }

    for (const [key, rows] of grouped) {
      expect(rows.map(({ caller }) => caller).sort(), key).toEqual([...CALLERS].sort());
    }
  });
});
