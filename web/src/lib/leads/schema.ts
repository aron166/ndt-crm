import { z } from "zod";

// Public lead-intake payload (POST /api/leads).
// Landing pages (BetonScan/BirdsView) and automations (n8n) post this shape.
// snake_case on the wire — that's what external HTML forms / webhooks emit.

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optStr = z.preprocess(emptyToUndef, z.string().trim().max(2000).optional());

export const leadIntakeSchema = z
  .object({
    company_name: z.preprocess(emptyToUndef, z.string().trim().min(1).max(300)),
    contact_name: optStr,
    contact_email: z.preprocess(
      emptyToUndef,
      z.string().trim().email().max(300).optional(),
    ),
    contact_phone: optStr,
    message: optStr,
    service_interest: optStr,
    source: z.preprocess(emptyToUndef, z.string().trim().max(100).default("web")),
    source_app: optStr, // falls back to the API key's appSlug if omitted

    // Marketing passthrough — stored on lead.customFields.
    utm_source: optStr,
    utm_medium: optStr,
    utm_campaign: optStr,
    utm_content: optStr,
    utm_term: optStr,
    referrer: optStr,
    landing_variant: optStr,
    lead_score: z.preprocess(emptyToUndef, z.coerce.number().optional()),
    priority: optStr,
  })
  .refine((d) => Boolean(d.contact_email || d.contact_phone), {
    message: "At least one of contact_email or contact_phone is required",
    path: ["contact_email"],
  });

export type LeadIntake = z.infer<typeof leadIntakeSchema>;
