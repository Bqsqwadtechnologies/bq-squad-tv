import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/api/public/v1/zillionaire/test-lab";
import { Firestore } from "@/lib/server/firebase-admin";
import * as api from "@/lib/server/api";
import * as roles from "@/lib/server/roles";
import * as audit from "@/lib/server/audit";

describe("Zillionaire test lab isolation", () => {
  let docs: Record<string, Record<string, unknown>>;
  const fs = {
    getDoc: vi.fn(async (p: string) => docs[p] ? { ...docs[p] } : null),
    setDoc: vi.fn(async (p: string, v: Record<string, unknown>) => { docs[p] = { ...v }; }),
    deleteDoc: vi.fn(async (p: string) => { delete docs[p]; }),
    docName: (p: string) => p,
  };
  const invoke = (body: unknown) => (Route as any).options.server.handlers.POST({ request: new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  beforeEach(() => {
    docs = {};
    vi.spyOn(Firestore, "create").mockResolvedValue(fs as any);
    vi.spyOn(api, "requireUser").mockResolvedValue({ uid: "owner-1" } as any);
    vi.spyOn(roles, "requireZillionaireModule").mockResolvedValue(true as any);
    vi.spyOn(audit, "writeAuditLog").mockResolvedValue("audit" as any);
  });
  afterEach(() => vi.restoreAllMocks());
  it("creates a hidden, unpublished, owner-scoped test channel", async () => {
    const res = await invoke({ action: "CREATE", reason: "Run isolated QA" });
    expect(res.status).toBe(200);
    const lab = docs["zillionaireTestLabOwners/owner-1"];
    if (!lab) throw new Error("Expected an owner-scoped test lab");
    const channel = docs[`channels/${lab["channelId"] as string}`];
    expect(channel).toMatchObject({ ownerUid: "owner-1", testOnly: true, hidden: true, published: false, liveChatSettings: { enabled: false } });
    expect(lab["testWalletMinor"]).toBe(10000);
  });
  it("records test preview as read-only and audited", async () => {
    docs["zillionaireTestLabOwners/owner-1"] = { active: true, testOnly: true, channelId: "test-owned" };
    const res = await invoke({ action: "IMPERSONATE_PREVIEW", reason: "Inspect test channel" });
    expect(await res.json()).toMatchObject({ channelId: "test-owned", mode: "read_only" });
    expect(audit.writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "test_lab.read_only_preview", targetId: "test-owned" }));
  });
});
