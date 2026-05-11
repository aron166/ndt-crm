import { Prisma } from '@prisma/client';

/**
 * Contact = a Person at a Company, bound to a time interval.
 * ended_at = null means the person currently works there.
 * Never delete contacts — close them with POST /contacts/:id/close.
 */

/** Shape of the include used on every contact query */
export const contactInclude = {
  person: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  company: { select: { id: true, name: true, vatNumber: true } },
} satisfies Prisma.ContactInclude;

/** Contact with embedded person + company summary — used in all responses */
export type ContactWithRelations = Prisma.ContactGetPayload<{
  include: typeof contactInclude;
}>;
