import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import {
  saveKycDraft,
  getKycDraft,
  deleteKycDraft,
} from "@/lib/server/kyc/persistence";

const draftSchema = z.object({
  step: z.number().int().min(1).max(6).optional(),
  countryCode: z.string().trim().length(2).optional(),
  legalCompanyName: z.string().trim().max(200).optional(),
  registrationNumber: z.string().trim().max(64).optional(),
  taxId: z.string().trim().max(64).optional(),
  businessEmail: z.string().trim().max(160).optional(),
  businessEmailVerified: z.boolean().optional(),
  businessPhone: z.string().trim().max(30).optional(),
  businessPhoneVerified: z.boolean().optional(),
  registeredAddress: z
    .object({
      line1: z.string().trim().max(200).optional(),
      line2: z.string().trim().max(200).optional(),
      city: z.string().trim().max(100).optional(),
      state: z.string().trim().max(100).optional(),
      postalCode: z.string().trim().max(30).optional(),
      country: z.string().trim().max(100).optional(),
    })
    .optional(),
  representative: z
    .object({
      fullName: z.string().trim().max(160).optional(),
      title: z.string().trim().max(100).optional(),
      idTypeId: z.string().trim().max(50).optional(),
      idNumber: z.string().trim().max(64).optional(),
    })
    .optional(),
  settlementAccount: z
    .object({
      bankName: z.string().trim().max(100).optional(),
      accountNumber: z.string().trim().max(64).optional(),
      accountName: z.string().trim().max(160).optional(),
      currency: z.string().trim().max(10).optional(),
    })
    .optional(),
  evidenceUploadIds: z.array(z.string().trim().max(64)).optional(),
});

export const Route = createFileRoute("/api/public/v1/provider/verification/draft")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const draft = await getKycDraft(fs, user.uid);
          return Response.json({ draft });
        } catch (error) {
          return errorBody(error);
        }
      },
      PUT: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const raw = await request.json().catch(() => null);
          const parsed = draftSchema.safeParse(raw);
          if (!parsed.success) {
            throw new ApiError(400, "INVALID_DRAFT_PAYLOAD", "Draft contains invalid fields.");
          }

          await saveKycDraft(fs, user.uid, parsed.data);
          return Response.json({ ok: true, savedAt: new Date().toISOString() });
        } catch (error) {
          return errorBody(error);
        }
      },
      DELETE: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await deleteKycDraft(fs, user.uid);
          return Response.json({ ok: true });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
