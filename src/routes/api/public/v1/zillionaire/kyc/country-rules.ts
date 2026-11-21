import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import {
  getAllCountryRules,
  getCountryRule,
  ALL_COUNTRIES,
  type KycCountryRule,
} from "@/lib/kyc-country-rules";

const updateSchema = z.object({
  countryCode: z.string().trim().regex(/^[A-Z]{2}$/),
  ruleUpdate: z.record(z.any()),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/country-rules")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const access = await resolvePlatformAccess(
            fs,
            user.uid,
            user.email,
            user.customClaims,
            user.emailVerified === true
          );

          const hasAccess =
            access.isZillionaireOwner ||
            access.zillionaireModules.some((m) =>
              ["security", "settings", "finance", "producers", "providers"].includes(m)
            );

          if (!hasAccess) {
            throw new ApiError(403, "FORBIDDEN", "You do not have access to KYC country rules.");
          }

          const overridesDoc = await fs.getDoc("system/kycCountryRules");
          const customOverrides = (overridesDoc?.["overrides"] || {}) as Record<string, Partial<KycCountryRule>>;

          const rules = getAllCountryRules(customOverrides);

          const tailoredCount = rules.filter((r) => !r.isGeneric && !customOverrides[r.code]).length;
          const genericCount = rules.filter((r) => r.isGeneric).length;
          const customCount = Object.keys(customOverrides).length;

          return Response.json({
            ok: true,
            stats: {
              total: rules.length,
              tailoredCount,
              genericCount,
              customCount,
            },
            customOverrides,
            rules,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const access = await resolvePlatformAccess(
            fs,
            user.uid,
            user.email,
            user.customClaims,
            user.emailVerified === true
          );

          const hasAccess =
            access.isZillionaireOwner ||
            access.zillionaireModules.some((m) =>
              ["security", "settings", "finance"].includes(m)
            );

          if (!hasAccess) {
            throw new ApiError(403, "FORBIDDEN", "Only compliance and platform owners can modify KYC country rules.");
          }

          const body = await parseBody(request, updateSchema);
          const countryCode = body.countryCode.toUpperCase();

          const matchedCountry = ALL_COUNTRIES.find((c) => c.code === countryCode);
          if (!matchedCountry) {
            throw new ApiError(400, "INVALID_COUNTRY_CODE", `Country code ${countryCode} is not in the 193-country index.`);
          }

          const existingDoc = await fs.getDoc("system/kycCountryRules");
          const currentOverrides = (existingDoc?.["overrides"] || {}) as Record<string, Partial<KycCountryRule>>;

          const now = new Date().toISOString();
          const updatedCountryOverride = {
            ...(currentOverrides[countryCode] || {}),
            ...body.ruleUpdate,
            updatedAt: now,
            updatedBy: user.uid,
          };

          const newOverrides = {
            ...currentOverrides,
            [countryCode]: updatedCountryOverride,
          };

          await fs.setDoc("system/kycCountryRules", {
            overrides: newOverrides,
            lastUpdatedAt: now,
            lastUpdatedBy: user.uid,
          });

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "kyc.country_rule_updated",
            targetType: "kyc_country_rule",
            targetId: countryCode,
            reason: body.reason,
            metadata: {
              countryCode,
              ruleUpdate: body.ruleUpdate,
            },
          });

          const updatedRule = getCountryRule(countryCode, newOverrides);

          return Response.json({
            ok: true,
            countryCode,
            updatedRule,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
