// Server-side Firebase Admin access for the Lovable-hosted BQ SQWAD TV API.
// Uses the service-account JSON credential with the Firestore REST API and
// Web Crypto (no Node-only Firebase Admin SDK), so it runs on the hosting edge.
// All credential reads happen inside functions — never at module scope.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

function getServiceAccount(): ServiceAccount {
  const raw = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (!raw) {
    throw new ApiError(503, "FIREBASE_NOT_CONFIGURED", "Firebase service account is not configured.");
  }
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch {
    throw new ApiError(503, "FIREBASE_NOT_CONFIGURED", "Firebase service account configuration is invalid.");
  }
  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    throw new ApiError(503, "FIREBASE_NOT_CONFIGURED", "Firebase service account configuration is incomplete.");
  }
  return parsed as ServiceAccount;
}

export function getFirebaseProjectId(): string {
  return getServiceAccount().project_id;
}

// ---- base64url / PEM helpers ----

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function base64UrlEncodeBytes(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

export function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function pemToBytes(pem: string): Uint8Array {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export { toArrayBuffer };

// ---- service-account OAuth access token ----

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export async function getAdminAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  const serviceAccount = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    `${base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.` +
    base64UrlEncode(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/datastore",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(pemToBytes(serviceAccount.private_key)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    toArrayBuffer(new TextEncoder().encode(unsigned)),
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64UrlEncodeBytes(new Uint8Array(signature))}`,
    }),
  });
  const payload = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new ApiError(502, "GOOGLE_AUTH_FAILED", "Could not obtain a Google access token.");
  }
  cachedAccessToken = {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}

// ---- Firestore value codecs ----

export type FirestoreValue = Record<string, unknown>;

export function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  }
  throw new Error(`Unsupported Firestore value type: ${typeof value}`);
}

export function encodeFields(fields: Record<string, unknown>): Record<string, FirestoreValue> {
  const encoded: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) encoded[key] = encodeValue(value);
  }
  return encoded;
}

export function decodeValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value["booleanValue"];
  if ("integerValue" in value) return Number(value["integerValue"]);
  if ("doubleValue" in value) return value["doubleValue"];
  if ("stringValue" in value) return value["stringValue"];
  if ("timestampValue" in value) return value["timestampValue"];
  if ("arrayValue" in value) {
    const values = (value["arrayValue"] as { values?: FirestoreValue[] } | undefined)?.values ?? [];
    return values.map(decodeValue);
  }
  if ("mapValue" in value) {
    const fields = (value["mapValue"] as { fields?: Record<string, FirestoreValue> } | undefined)?.fields ?? {};
    return decodeFields(fields);
  }
  return null;
}

export function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const decoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) decoded[key] = decodeValue(value);
  return decoded;
}

// ---- Firestore REST client ----

export type FirestoreWrite =
  | { update: { name: string; fields: Record<string, FirestoreValue> }; updateMask?: { fieldPaths: string[] }; currentDocument?: { exists: boolean } }
  | { delete: string }
  | {
      transform: {
        document: string;
        fieldTransforms: Array<{ fieldPath: string; increment?: FirestoreValue; setToServerValue?: string }>;
      };
    };

export type QueryFilter = { field: string; op: "EQUAL" | "LESS_THAN" | "GREATER_THAN" | "ARRAY_CONTAINS"; value: unknown };

export class Firestore {
  private constructor(
    private readonly projectId: string,
    private readonly token: string,
  ) {}

  static async create(): Promise<Firestore> {
    const serviceAccount = getServiceAccount();
    return new Firestore(serviceAccount.project_id, await getAdminAccessToken());
  }

  private documentsUrl(): string {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, "content-type": "application/json" };
  }

  docName(path: string): string {
    return `projects/${this.projectId}/databases/(default)/documents/${path}`;
  }

  async getDoc(path: string): Promise<Record<string, unknown> | null> {
    const response = await fetch(`${this.documentsUrl()}/${path}`, { headers: this.headers() });
    if (response.status === 404) return null;
    const body = (await response.json()) as { fields?: Record<string, FirestoreValue>; error?: { message?: string } };
    if (!response.ok) throw new ApiError(502, "FIRESTORE_ERROR", body.error?.message ?? "Firestore read failed.");
    return decodeFields(body.fields ?? {});
  }

  async setDoc(path: string, fields: Record<string, unknown>, options?: { mustNotExist?: boolean }): Promise<void> {
    const write: FirestoreWrite = {
      update: { name: this.docName(path), fields: encodeFields(fields) },
      ...(options?.mustNotExist ? { currentDocument: { exists: false } } : {}),
    };
    await this.commit([write]);
  }

  async patchDoc(path: string, fields: Record<string, unknown>): Promise<void> {
    await this.commit([
      {
        update: { name: this.docName(path), fields: encodeFields(fields) },
        updateMask: { fieldPaths: Object.keys(fields).filter((key) => fields[key] !== undefined) },
      },
    ]);
  }

  async deleteDoc(path: string): Promise<void> {
    await this.commit([{ delete: this.docName(path) }]);
  }

  async commit(writes: FirestoreWrite[], transaction?: string): Promise<void> {
    const response = await fetch(`${this.documentsUrl()}:commit`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ writes, ...(transaction ? { transaction } : {}) }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      if (response.status === 409 || response.status === 412) {
        throw new ApiError(409, "CONFLICT", "A concurrent update conflicted; retry the request.");
      }
      throw new ApiError(502, "FIRESTORE_ERROR", body.error?.message ?? "Firestore write failed.");
    }
  }

  async query(
    collectionId: string,
    options?: {
      filters?: QueryFilter[];
      orderByField?: string;
      descending?: boolean;
      limit?: number;
      startAfter?: { fieldValue: unknown; documentId: string };
    },
  ): Promise<Array<Record<string, unknown> & { __id: string }>> {
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId }],
      ...(options?.limit ? { limit: options.limit } : {}),
    };
    if (options?.filters && options.filters.length > 0) {
      const filters = options.filters.map((filter) => ({
        fieldFilter: { field: { fieldPath: filter.field }, op: filter.op, value: encodeValue(filter.value) },
      }));
      structuredQuery["where"] =
        filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } };
    }
    if (options?.orderByField) {
      const direction = options.descending ? "DESCENDING" : "ASCENDING";
      structuredQuery["orderBy"] = [
        { field: { fieldPath: options.orderByField }, direction },
        { field: { fieldPath: "__name__" }, direction },
      ];
    }
    if (options?.startAfter && options.orderByField) {
      structuredQuery["startAt"] = {
        values: [
          encodeValue(options.startAfter.fieldValue),
          { referenceValue: this.docName(options.startAfter.documentId) },
        ],
        before: false,
      };
    }
    const response = await fetch(`${this.documentsUrl()}:runQuery`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ structuredQuery }),
    });
    const body = (await response.json()) as Array<{
      document?: { name: string; fields?: Record<string, FirestoreValue> };
      error?: { message?: string };
    }> & { error?: { message?: string } };
    if (!response.ok) {
      throw new ApiError(502, "FIRESTORE_ERROR", (body as { error?: { message?: string } }).error?.message ?? "Firestore query failed.");
    }
    const rows: Array<Record<string, unknown> & { __id: string }> = [];
    for (const result of body) {
      if (result.document) {
        rows.push({
          ...decodeFields(result.document.fields ?? {}),
          __id: result.document.name.split("/").pop() ?? "",
        });
      }
    }
    return rows;
  }

  /**
   * Runs a read-modify-write Firestore transaction. Reads are validated on
   * commit, so concurrent writers cause a 409 the caller can retry.
   */
  async transact<T>(
    readPaths: string[],
    fn: (docs: Array<Record<string, unknown> | null>) => Promise<{ result: T; writes: FirestoreWrite[] }> | { result: T; writes: FirestoreWrite[] },
  ): Promise<T> {
    const begin = await fetch(`${this.documentsUrl()}:beginTransaction`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ options: { readWrite: {} } }),
    });
    const beginBody = (await begin.json()) as { transaction?: string; error?: { message?: string } };
    if (!begin.ok || !beginBody.transaction) {
      throw new ApiError(502, "FIRESTORE_ERROR", beginBody.error?.message ?? "Could not begin a Firestore transaction.");
    }
    const transaction = beginBody.transaction;

    let docs: Array<Record<string, unknown> | null> = [];
    if (readPaths.length > 0) {
      const batchGet = await fetch(`${this.documentsUrl()}:batchGet`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ documents: readPaths.map((path) => this.docName(path)), transaction }),
      });
      const batchBody = (await batchGet.json()) as Array<{
        found?: { fields?: Record<string, FirestoreValue> };
        missing?: string;
      }> & { error?: { message?: string } };
      if (!batchGet.ok) {
        throw new ApiError(502, "FIRESTORE_ERROR", (batchBody as { error?: { message?: string } }).error?.message ?? "Firestore transactional read failed.");
      }
      docs = batchBody.map((entry) => (entry.found ? decodeFields(entry.found.fields ?? {}) : null));
    }

    const { result, writes } = await fn(docs);
    await this.commit(writes, transaction);
    return result;
  }
}
