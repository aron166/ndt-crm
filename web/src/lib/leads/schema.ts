import { z } from "zod";
import { answersRecordSchema } from "./qualification";

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
    // Inbound channel + campaign tag (Phase 2). Defaults to "landing" — the
    // landing pages were the only caller before channels existed.
    channel: z.preprocess(
      emptyToUndef,
      z.enum(["cold_email", "landing", "linkedin", "meta_ads", "referral", "import", "manual"]).default("landing"),
    ),
    campaign: optStr,
    // Cold-email reply intake (addendum item 3). The thread this reply came
    // back on — the same string `threadKeyFor()` stamped on the sent draft.
    // Posting it twice is safe: it is the idempotency key, and the second post
    // returns the first lead instead of creating another.
    thread_key: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),

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

    // Qualification answers keyed by the permanent slugs in the locked
    // qualification model (birdsview/27_qualification_model.md): `gate` plus
    // either the Branch A seven (situation, concrete, goal, size, postcode,
    // timing, own_device) or the Branch B three (hook, use_case, work).
    // Same shape as the setter tab writes, so both land on leads.qualification.
    // `intent_path` (task|curious) is accepted as the wire alias of `gate`.
    // Deliberately open (z.record) — adding a question must never need a deploy,
    // and an answer must never be dropped because a slug was renamed.
    qualification: answersRecordSchema.optional(),
    // Send the intro material (termékismertető) now: emails it when Resend is
    // connected, otherwise creates the "Küldd el a termékismertetőt" task.
    send_intro: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.contact_email || d.contact_phone), {
    message: "At least one of contact_email or contact_phone is required",
    path: ["contact_email"],
  });

export type LeadIntake = z.infer<typeof leadIntakeSchema>;
