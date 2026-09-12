import { z } from "zod";
import { answersRecordSchema } from "./qualification";
import { TIERS } from "./tier";

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
    // Cold-email reply intake (addendum item 3). TWO different keys, because
    // they answer two different questions and conflating them loses replies:
    //
    //   thread_key — the PROVIDER's id for this email conversation (the Gmail
    //     thread id). One real conversation, one value. This is the idempotency
    //     key: re-reading the same thread must not create a second lead.
    //   draft_key  — `email_drafts.thread_key`, i.e. threadKeyFor(campaign,
    //     companyId). It identifies the OUTREACH we sent, which is
    //     campaign+company-grained and therefore shared by all four touches.
    //     Used only to find the draft, its company, and to mark it replied.
    //
    // The first version used the draft key for both. That made the contract
    // one-lead-per-campaign-per-company while the docs promised
    // one-lead-per-thread: a prospect who said "not now" to touch 1 and "send
    // the quote" three weeks later had the second reply silently swallowed as a
    // duplicate. (Vanda, #89.)
    // Both are lowercased: the unique index is case-sensitive, and the intake
    // skill hand-builds these strings — "BirdsView-Q4:42" and "birdsview-q4:42"
    // would otherwise be two index entries, i.e. two leads and two intro emails
    // for one answered thread. (Vanda, #89.)
    thread_key: z.preprocess(emptyToUndef, z.string().trim().toLowerCase().max(200).optional()),
    draft_key: z.preprocess(emptyToUndef, z.string().trim().toLowerCase().max(200).optional()),

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
    // Optional pre-tier from a caller that already knows it (e.g. cold-outreach
    // research, which tiers a prospect before any qualification answers exist).
    // A derived tier always wins when there are answers to derive from — see
    // ingest.ts. Never submitted by the landing forms.
    tier: z.enum(TIERS).optional(),
    // Send the intro material (termékismertető) now: emails it when Resend is
    // connected, otherwise creates the "Küldd el a termékismertetőt" task.
    send_intro: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.contact_email || d.contact_phone), {
    message: "At least one of contact_email or contact_phone is required",
    path: ["contact_email"],
  });

export type LeadIntake = z.infer<typeof leadIntakeSchema>;
