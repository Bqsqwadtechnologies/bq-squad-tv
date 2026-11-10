import { createFileRoute } from "@tanstack/react-router";

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
  project_id?: string;
};

type FirestoreValue = Record<string, unknown>;

export const Route = createFileRoute("/api/public/firebase-schema-inspect")({
  server: {
    handlers: {
      GET: async () => {
        const rawServiceAccount = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
        if (!rawServiceAccount) {
          return Response.json({ error: "Firebase service account is not configured." }, { status: 503 });
        }

        let serviceAccount: ServiceAccount;
        try {
          serviceAccount = JSON.parse(rawServiceAccount) as ServiceAccount;
        } catch {
          return Response.json({ error: "Firebase service account configuration is invalid." }, { status: 503 });
        }

        if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
          return Response.json({ error: "Firebase service account configuration is incomplete." }, { status: 503 });
        }

        try {
          const accessToken = await getReadOnlyAccessToken(serviceAccount);
          const databaseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/databases/(default)/documents`;
          const rootCollections = await listCollectionIds(databaseUrl, accessToken);
          const collections = await Promise.all(rootCollections.map(async (collection) => {
            const response = await fetch(`${databaseUrl}/${encodeURIComponent(collection)}?pageSize=3`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const payload = await response.json() as { documents?: Array<{ fields?: Record<string, FirestoreValue> }>; error?: { message?: string } };
            if (!response.ok) throw new Error(payload.error?.message ?? `Could not read collection ${collection}.`);
            const fields: Record<string, string> = {};
            for (const document of payload.documents ?? []) {
              collectFieldTypes(document.fields ?? {}, fields);
            }
            return { name: collection, fields };
          }));

          return Response.json({ projectId: serviceAccount.project_id, collections });
        } catch (error) {
          console.error("Firestore schema inspection failed", error);
          return Response.json({ error: "Firestore schema inspection failed. Check service access and database setup." }, { status: 502 });
        }
      },
    },
  },
});

async function getReadOnlyAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const unsignedToken = `${base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64UrlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform.read-only",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 300,
  }))}`;
  const keyBytes = pemToBytes(serviceAccount.private_key ?? "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsignedToken));
  const assertion = `${unsignedToken}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json() as { access_token?: string };
  if (!response.ok || !payload.access_token) throw new Error("Google access token request failed.");
  return payload.access_token;
}

async function listCollectionIds(databaseUrl: string, accessToken: string): Promise<string[]> {
  const response = await fetch(`${databaseUrl}:listCollectionIds`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ pageSize: 100 }),
  });
  const payload = await response.json() as { collectionIds?: string[]; nextPageToken?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "Could not list Firestore collections.");
  if (payload.nextPageToken) throw new Error("Firestore has more than 100 root collections; inspection stopped at the safe limit.");
  return payload.collectionIds ?? [];
}

function collectFieldTypes(fields: Record<string, FirestoreValue>, output: Record<string, string>, prefix = ""): void {
  for (const [name, value] of Object.entries(fields)) {
    const key = prefix ? `${prefix}.${name}` : name;
    const type = Object.keys(value)[0] ?? "unknown";
    output[key] = type;
    if (type === "mapValue" && value.mapValue && typeof value.mapValue === "object") {
      const mapFields = (value.mapValue as { fields?: Record<string, FirestoreValue> }).fields;
      if (mapFields) collectFieldTypes(mapFields, output, key);
    }
    if (type === "arrayValue") {
      const values = (value.arrayValue as { values?: FirestoreValue[] } | undefined)?.values ?? [];
      for (const item of values.slice(0, 3)) {
        const itemType = Object.keys(item)[0] ?? "unknown";
        output[`${key}[]`] = itemType;
        if (itemType === "mapValue" && item.mapValue && typeof item.mapValue === "object") {
          const mapFields = (item.mapValue as { fields?: Record<string, FirestoreValue> }).fields;
          if (mapFields) collectFieldTypes(mapFields, output, `${key}[]`);
        }
      }
    }
  }
}

function pemToBytes(pem: string): Uint8Array {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}