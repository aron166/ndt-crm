import { z } from "zod";

// Ecosystem-hub ingestion payloads (POST /api/events, POST /api/conversations).
// Portfolio apps and agents (VeloQuote, BirdsView, CashFlow, …) post these
// shapes. camelCase on the wire — these callers are our own services, unlike
// the snake_case public lead form (lib/leads/schema.ts).

/** Upper bound on a single event/conversation payload once serialized. */
export const MAX_PAYLOAD_BYTES = 32 * 1024;

/** Upper bound on messages accepted in one conversation ingest. */
export const MAX_MESSAGES = 200;

const id = z.number().int().positive();

const payloadWithinLimit = (payload: unknown) =>
  JSON.stringify(payload).length <= MAX_PAYLOAD_BYTES;

export const appEventSchema = z
  .object({
    // Honored only on the deprecated service-role-key path; app-key callers
    // get their tenant from the key itself (mismatches are rejected in-route).
    tenantId: id.optional(),
    // Optional for app-key callers (falls back to the key's appSlug);
    // the route 400s when neither is available.
    sourceApp: z.string().trim().min(1).max(64).optional(),
    eventType: z.string().trim().min(1).max(128),
    payload: z.record(z.string(), z.unknown()),
    agentId: id.optional(),
    personId: id.optional(),
    companyId: id.optional(),
  })
  .refine((d) => payloadWithinLimit(d.payload), {
    message: `payload exceeds ${MAX_PAYLOAD_BYTES} bytes`,
    path: ["payload"],
  });

export type AppEventIntake = z.infer<typeof appEventSchema>;

export const conversationIntakeSchema = z
  .object({
    tenantId: id.optional(),
    agentId: id.optional(),
    personId: id.optional(),
    companyId: id.optional(),
    channel: z.string().trim().min(1).max(64), // web_chat, phone, email, intake_form
    summary: z.string().trim().max(8000).optional(),
    endedAt: z.coerce.date().optional(),
    messages: z
      .array(
        z.object({
          role: z.string().trim().min(1).max(32), // user, assistant, system
          content: z.string().min(1).max(16_000),
        }),
      )
      .max(MAX_MESSAGES)
      .optional(),
  })
  .refine((d) => payloadWithinLimit(d.messages ?? []), {
    message: `messages exceed ${MAX_PAYLOAD_BYTES} bytes`,
    path: ["messages"],
  });

export type ConversationIntake = z.infer<typeof conversationIntakeSchema>;
