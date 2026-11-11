import { z } from "zod";

// Wire shapes for /api/deals (app key). Deal reads carry the pipeline's custom
// field definitions so an agent knows which keys PATCH accepts.

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optInt = z.preprocess(emptyToUndef, z.coerce.number().int().positive().optional());

export const DEAL_PAGE_SIZE_MAX = 100;
export const dealListQuerySchema = z.object({
  pipeline_id: optInt,
  stage_id: optInt,
  page: z.preprocess(emptyToUndef, z.coerce.number().int().positive().default(1)),
  page_size: z.preprocess(emptyToUndef, z.coerce.number().int().positive().max(DEAL_PAGE_SIZE_MAX).default(25)),
});

export const dealPatchSchema = z
  .object({
    stage_id: z.number().int().positive().optional(),
    /** Merged into deal.custom_fields; keys must be the pipeline's fields; null deletes. */
    custom_fields: z.record(z.string().max(100), z.string().max(500).nullable()).optional(),
  })
  .strict()
  .refine((d) => d.stage_id !== undefined || (d.custom_fields && Object.keys(d.custom_fields).length > 0), { message: "Empty patch" });

export const DEAL_API_SELECT = {
  id: true, title: true, value: true, currency: true, pipelineId: true, stageId: true,
  companyId: true, personId: true, assignedToId: true, customFields: true,
  expectedCloseDate: true, stageEnteredAt: true, createdAt: true, updatedAt: true,
  stage: { select: { name: true, isTerminalWon: true, isTerminalLost: true } },
  company: { select: { name: true } },
  convertedFromLeads: { select: { id: true } },
} as const;
