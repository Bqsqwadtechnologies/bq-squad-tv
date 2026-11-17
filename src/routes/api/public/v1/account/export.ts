import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

function requireRecentAuthentication(authTime: number): void {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(authTime) || authTime <= 0 || nowSeconds - authTime > 300 || authTime > nowSeconds + 30) {
    throw new ApiError(401, "RECENT_SIGN_IN_REQUIRED", "Please sign in again before exporting account data.");
  }
}

function safeProfile(value: Record<string, unknown> | null): Record<string, unknown> {
  if (!value) return {};
  const allowed = [
    "email", "displayName", "countryCode", "preferredCurrency", "dateOfBirth",
    "profileComplete", "adultEligible", "adultAgeVerified", "adultIdentityVerified",
    "parentalPinEnabled", "createdAt", "updatedAt", "accountStatus",
  ];
  return Object.fromEntries(allowed.flatMap(key => value[key] === undefined ? [] : [[key, value[key]]]));
}

export const Route = createFileRoute("/api/public/v1/account/export")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        requireRecentAuthentication(user.authTime);
        const fs = await Firestore.create();
        const [profile, wallet, ledger, payments, sessions, notifications] = await Promise.all([
          fs.getDoc("users/" + user.uid),
          fs.getDoc("wallets/" + user.uid),
          fs.query("ledger", { filters: [{ field: "uid", op: "EQUAL", value: user.uid }], orderByField: "createdAt", descending: true, limit: 500 }),
          fs.query("payments", { filters: [{ field: "uid", op: "EQUAL", value: user.uid }], orderByField: "createdAt", descending: true, limit: 200 }),
          fs.query("sessions", { filters: [{ field: "uid", op: "EQUAL", value: user.uid }], orderByField: "startedAt", descending: true, limit: 200 }),
          fs.query("users/" + user.uid + "/notifications", { orderByField: "createdAt", descending: true, limit: 200 }),
        ]);
        const stripId = (row: Record<string, unknown>) => {
          const { __id, ...fields } = row;
          return { id: __id, ...fields };
        };
        const safePayment = (row: Record<string, unknown>) => {
          const allowed = ["provider", "reference", "packageId", "productId", "amountMinor", "creditMinor", "currency", "status", "createdAt", "creditedAt", "reversedAt"];
          return Object.fromEntries(allowed.flatMap(key => row[key] === undefined ? [] : [[key, row[key]]]));
        };
        const safeSession = (row: Record<string, unknown>) => {
          const allowed = ["channelId", "contentAssetId", "clientPlatform", "currency", "ratePerMinuteMinor", "billedSeconds", "sessionTotalMinor", "startedAt", "endedAt", "endReason", "active"];
          return Object.fromEntries(allowed.flatMap(key => row[key] === undefined ? [] : [[key, row[key]]]));
        };
        const safeNotification = (row: Record<string, unknown>) => {
          const allowed = ["title", "body", "category", "read", "createdAt", "readAt"];
          return Object.fromEntries(allowed.flatMap(key => row[key] === undefined ? [] : [[key, row[key]]]));
        };
        const exportData = {
          exportedAt: new Date().toISOString(),
          account: safeProfile(profile),
          wallet: wallet ? {
            balanceMinor: wallet["balanceMinor"] ?? 0,
            currency: wallet["currency"] ?? "NGN",
            dailySpendLimitMinor: wallet["dailySpendLimitMinor"] ?? null,
            monthlyBudgetMinor: wallet["monthlyBudgetMinor"] ?? null,
          } : null,
          ledger: ledger.map(stripId),
          payments: payments.map(row => safePayment(row)),
          sessions: sessions.map(row => safeSession(row)),
          notifications: notifications.map(row => safeNotification(row)),
          truncated: {
            ledger: ledger.length === 500,
            payments: payments.length === 200,
            sessions: sessions.length === 200,
            notifications: notifications.length === 200,
          },
        };
        return Response.json(exportData, {
          headers: {
            "cache-control": "private, no-store",
            "content-disposition": "attachment; filename=bq-sqwad-tv-account-export.json",
          },
        });
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
