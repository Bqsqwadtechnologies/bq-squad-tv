import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";

import { isFreeEmailDomain } from "@/lib/server/company-email";

const schema = z.object({
  companyName: z.string().trim().min(2, "Company name is required").max(120),
  companyEmail: z.string().trim().email("Valid company email is required").max(254),
  country: z.string().trim().min(2, "Country is required").max(80),
  phone: z.string().trim().min(6, "Valid phone number is required").max(30),
  representative: z.string().trim().min(2, "Representative name is required").max(120),
  website: z.string().trim().max(2048).optional(),
  description: z.string().trim().min(10, "Please provide a description (min 10 characters)").max(2000),
  expectedChannels: z.string().trim().max(500).optional(),
  licencesHeld: z.string().trim().max(500).optional(),
});

export const Route = createFileRoute("/api/public/v1/partner/enquiry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Rate limit partner enquiries: 5 per hour per IP
          const fs = await Firestore.create();
          const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown";
          await enforceRateLimit(fs, `partner_enquiry:${ip}`, {
            limit: 5,
            windowMs: 3600 * 1000,
          });

          const body = await parseBody(request, schema);

          if (isFreeEmailDomain(body.companyEmail)) {
            throw new ApiError(
              400,
              "COMPANY_EMAIL_REQUIRED",
              "Personal or free-mail providers (Gmail, Yahoo, Outlook, Proton, etc.) are not accepted for partner enquiries. Please provide your official company domain email.",
            );
          }

          const enquiryId = `enq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const now = new Date().toISOString();

          const record = {
            id: enquiryId,
            companyName: body.companyName,
            companyEmail: body.companyEmail,
            country: body.country,
            phone: body.phone,
            representative: body.representative,
            website: body.website || "",
            description: body.description,
            expectedChannels: body.expectedChannels || "",
            licencesHeld: body.licencesHeld || "",
            status: "pending",
            submittedAt: now,
            updatedAt: now,
          };

          await fs.setDoc(`partnerEnquiries/${enquiryId}`, record);

          await writeAuditLog(fs, {
            action: "partner.enquiry_submitted",
            actorUid: "anonymous",
            actorEmail: body.companyEmail,
            targetType: "partner_enquiry",
            targetId: enquiryId,
            reason: "Partner enquiry submitted for review.",
            metadata: {
              companyName: body.companyName,
              companyEmail: body.companyEmail,
              country: body.country,
            },
          });

          return Response.json(
            {
              success: true,
              message: "Request received. We will review it and notify you.",
              enquiryId,
            },
            { status: 201, headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
