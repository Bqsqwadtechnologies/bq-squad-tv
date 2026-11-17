import { ApiError, type Firestore, encodeFields } from "./firebase-admin";

export type AuditInput = {
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

export type AuditChainResult = { valid: boolean; checked: number; brokenEntryId: string | null; reason: string | null };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return "{" + entries.map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

export async function auditEntryHash(entry: Record<string, unknown>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(entry)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function writeAuditLog(fs: Firestore, input: AuditInput): Promise<string> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 1000) {
    throw new ApiError(400, "AUDIT_REASON_REQUIRED", "A reason of 3 to 1000 characters is required.");
  }
  if (!input.actorUid || !input.action || !input.targetType || !input.targetId) {
    throw new ApiError(400, "AUDIT_FIELDS_REQUIRED", "Audit actor, action and target are required.");
  }
  const id = crypto.randomUUID();
  const entryPath = "auditLog/" + id;
  const headPath = "auditChain/head";
  const createdAt = new Date().toISOString();
  await fs.transact([headPath, entryPath], docs => {
    const head = docs[0] ?? {};
    const previousHash = typeof head["hash"] === "string" ? head["hash"] : "GENESIS";
    const sequence = typeof head["sequence"] === "number" && Number.isSafeInteger(head["sequence"])
      ? (head["sequence"] as number) + 1 : 1;
    const entry = {
      actorUid: input.actorUid, action: input.action, targetType: input.targetType,
      targetId: input.targetId, reason,
      ...(input.before === undefined ? {} : { before: input.before }),
      ...(input.after === undefined ? {} : { after: input.after }),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      sequence, previousHash, createdAt,
    };
    return (async () => {
      const hash = await auditEntryHash(entry);
      return {
        result: undefined,
        writes: [
          { update: { name: fs.docName(entryPath), fields: encodeFields({ ...entry, hash }) }, currentDocument: { exists: false } },
          { update: { name: fs.docName(headPath), fields: encodeFields({ sequence, hash, updatedAt: createdAt }) } },
        ],
      };
    })();
  });
  return id;
}

export async function verifyAuditChain(fs: Firestore, limit = 500): Promise<AuditChainResult> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new ApiError(400, "AUDIT_VERIFY_LIMIT_INVALID", "The audit verification page size is invalid.");
  }
  const rows = await fs.query("auditLog", { orderByField: "sequence", limit });
  let previousHash = "GENESIS";
  let expectedSequence = 1;
  for (const row of rows) {
    const storedHash = row["hash"];
    const storedPrevious = row["previousHash"];
    const sequence = row["sequence"];
    if (storedPrevious !== previousHash || sequence !== expectedSequence || typeof storedHash !== "string") {
      return { valid: false, checked: expectedSequence - 1, brokenEntryId: row.__id, reason: "chain_link_invalid" };
    }
    const { __id: _id, hash: _hash, ...entry } = row;
    const actualHash = await auditEntryHash(entry);
    if (actualHash !== storedHash) {
      return { valid: false, checked: expectedSequence - 1, brokenEntryId: row.__id, reason: "entry_hash_invalid" };
    }
    previousHash = storedHash;
    expectedSequence++;
  }
  const head = await fs.getDoc("auditChain/head");
  if (rows.length > 0 && (head?.["hash"] !== previousHash || head?.["sequence"] !== rows.length)) {
    return { valid: false, checked: rows.length, brokenEntryId: null, reason: "chain_head_mismatch_or_page_incomplete" };
  }
  return { valid: true, checked: rows.length, brokenEntryId: null, reason: null };
}
