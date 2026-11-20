import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, getWallet } from "@/lib/server/api";
import { decodeLedgerCursor, encodeLedgerCursor } from "@/lib/server/ledger";
import { minorUnitDigits } from "@/lib/server/currency";
import { currencySymbol, formatMinorCurrency } from "@/lib/server/currency-format";

const limitSchema = z.coerce.number().int().min(1).max(100).default(25);

export const Route = createFileRoute("/api/public/v1/wallet/watch-history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const url = new URL(request.url);
          const limit = limitSchema.parse(url.searchParams.get("limit") ?? 25);
          const cursor = decodeLedgerCursor(url.searchParams.get("cursor"));
          const fs = await Firestore.create();
          const wallet = await getWallet(fs, user.uid);

          const rows = await fs.query("ledger", {
            filters: [
              { field: "uid", op: "EQUAL", value: user.uid },
              { field: "kind", op: "EQUAL", value: "watch_charge" },
            ],
            orderByField: "createdAt",
            descending: true,
            limit: limit + 1,
            ...(cursor
              ? { startAfter: { fieldValue: cursor.createdAt, documentId: cursor.id } }
              : {}),
          });

          const hasMore = rows.length > limit;
          const page = rows.slice(0, limit);
          const items = page.map((row) => {
            const amountMinor =
              typeof row["amountMinor"] === "number" && Number.isSafeInteger(row["amountMinor"])
                ? row["amountMinor"]
                : 0;
            const currency =
              typeof row["currency"] === "string" ? row["currency"] : wallet.currency;

            return {
              id: row.__id,
              description:
                typeof row["description"] === "string" ? row["description"] : "Viewing session",
              amountMinor,
              createdAt: typeof row["createdAt"] === "string" ? row["createdAt"] : "",
              currency,
              currencyCode: currency,
              minorUnitDigits: minorUnitDigits(currency),
              symbol: currencySymbol(currency),
              formattedAmount: formatMinorCurrency(amountMinor, currency),
              channelId: typeof row["channelId"] === "string" ? row["channelId"] : null,
              assetId: typeof row["assetId"] === "string" ? row["assetId"] : null,
              durationSeconds:
                typeof row["durationSeconds"] === "number" ? row["durationSeconds"] : null,
            };
          });

          const last = page.at(-1);
          const nextCursor =
            hasMore && last && typeof last["createdAt"] === "string"
              ? encodeLedgerCursor({ createdAt: last["createdAt"], id: last.__id })
              : null;

          return Response.json(
            {
              items,
              nextCursor,
              currency: wallet.currency,
              currencyCode: wallet.currency,
              minorUnitDigits: minorUnitDigits(wallet.currency),
              symbol: currencySymbol(wallet.currency),
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
