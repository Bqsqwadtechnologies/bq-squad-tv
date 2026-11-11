import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { decodeLedgerCursor, encodeLedgerCursor } from "@/lib/server/ledger";

const limitSchema = z.coerce.number().int().min(1).max(100).default(25);

export const Route = createFileRoute("/api/public/v1/wallet/ledger")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const url = new URL(request.url);
          const limit = limitSchema.parse(url.searchParams.get("limit") ?? 25);
          const cursor = decodeLedgerCursor(url.searchParams.get("cursor"));
          const fs = await Firestore.create();
          const rows = await fs.query("ledger", {
            filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
            orderByField: "createdAt",
            descending: true,
            limit: limit + 1,
            ...(cursor ? { startAfter: { fieldValue: cursor.createdAt, documentId: cursor.id } } : {}),
          });
          const hasMore = rows.length > limit;
          const page = rows.slice(0, limit);
          const items = page.map((row) => ({
            id: row.__id,
            description: typeof row["description"] === "string" ? row["description"] : "Wallet transaction",
            amountMinor: typeof row["amountMinor"] === "number" && Number.isSafeInteger(row["amountMinor"]) ? row["amountMinor"] : 0,
            createdAt: typeof row["createdAt"] === "string" ? row["createdAt"] : "",
            kind: typeof row["kind"] === "string" ? row["kind"] : "adjustment",
          }));
          const last = page.at(-1);
          const nextCursor = hasMore && last && typeof last["createdAt"] === "string"
            ? encodeLedgerCursor({ createdAt: last["createdAt"], id: last.__id })
            : null;
          return Response.json({ items, nextCursor });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
