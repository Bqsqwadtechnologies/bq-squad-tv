import { vi } from "vitest";
import { decodeFields, type Firestore } from "@/lib/server/firebase-admin";

export type MockDoc = Record<string, unknown>;

export interface FilterCondition {
  field: string;
  op: string;
  value: unknown;
}

export interface QueryOptions {
  filters?: FilterCondition[];
  orderByField?: string;
  descending?: boolean;
  limit?: number;
}

export function createRoleIsolationStore(initialDocs: Record<string, MockDoc> = {}) {
  const store = new Map<string, MockDoc>();
  for (const [k, v] of Object.entries(initialDocs)) {
    store.set(k, { ...v });
  }

  const fs: Partial<Firestore> = {
    docName: (path: string) => `projects/test-project/databases/(default)/documents/${path}`,
    getDoc: vi.fn(async (path: string) => store.get(path) || null),
    setDoc: vi.fn(async (path: string, data: MockDoc) => {
      store.set(path, { ...data });
    }),
    patchDoc: vi.fn(async (path: string, data: MockDoc) => {
      const existing = store.get(path) || {};
      store.set(path, { ...existing, ...data });
    }),
    deleteDoc: vi.fn(async (path: string) => {
      store.delete(path);
    }),
    transact: vi.fn(
      async <T>(
        paths: string[],
        fn: (docs: Array<MockDoc | null>) =>
          | Promise<{
              result: T;
              writes: Array<{ update?: { name: string; fields: unknown }; delete?: string }>;
            }>
          | {
              result: T;
              writes: Array<{ update?: { name: string; fields: unknown }; delete?: string }>;
            },
      ): Promise<T> => {
        const docs = paths.map((path) => store.get(path) || null);
        const { result, writes } = await fn(docs);
        const prefix = "projects/test-project/databases/(default)/documents/";
        for (const write of writes) {
          if (write.update) {
            const path = write.update.name.startsWith(prefix)
              ? write.update.name.slice(prefix.length)
              : write.update.name;
            store.set(path, decodeFields(write.update.fields as Record<string, unknown>));
          }
          if (write.delete) {
            const path = write.delete.startsWith(prefix)
              ? write.delete.slice(prefix.length)
              : write.delete;
            store.delete(path);
          }
        }
        return result;
      },
    ),
    query: vi.fn(async (collection: string, options?: QueryOptions) => {
      const prefix = `${collection}/`;
      const results: Array<Record<string, unknown> & { __id: string }> = [];
      const filters = options?.filters || [];

      for (const [key, val] of store.entries()) {
        if (key.startsWith(prefix)) {
          const docId = key.slice(prefix.length);
          // do not match sub-collections when querying top collection unless intended
          if (docId.includes("/")) continue;

          const doc: Record<string, unknown> & { __id: string } = {
            __id: docId,
            ...val,
          };

          let matches = true;
          for (const f of filters) {
            const actualVal = doc[f.field];
            if (f.op === "EQUAL") {
              if (actualVal !== f.value) {
                matches = false;
                break;
              }
            } else if (f.op === "NOT_EQUAL") {
              if (actualVal === f.value) {
                matches = false;
                break;
              }
            } else if (f.op === "ARRAY_CONTAINS") {
              if (!Array.isArray(actualVal) || !actualVal.includes(f.value)) {
                matches = false;
                break;
              }
            }
          }

          if (matches) {
            results.push(doc);
          }
        }
      }

      if (options?.orderByField) {
        const field = options.orderByField;
        const desc = !!options.descending;
        results.sort((a, b) => {
          const valA = a[field];
          const valB = b[field];
          if (valA === valB) return 0;
          if (valA === undefined) return 1;
          if (valB === undefined) return -1;
          if (desc) {
            return valA < valB ? 1 : -1;
          } else {
            return valA > valB ? 1 : -1;
          }
        });
      }

      if (typeof options?.limit === "number" && options.limit > 0) {
        return results.slice(0, options.limit);
      }

      return results;
    }),
  };

  return { store, fs: fs as unknown as Firestore };
}
