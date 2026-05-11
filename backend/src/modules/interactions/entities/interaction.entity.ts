import { Prisma } from '@prisma/client';

/**
 * Interactions are append-only — the immutable communication log.
 * Never update, never delete. If you need to correct something, log a new one.
 */

export const interactionInclude = {
  user: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  person: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.InteractionInclude;

export type InteractionWithRelations = Prisma.InteractionGetPayload<{
  include: typeof interactionInclude;
}>;
