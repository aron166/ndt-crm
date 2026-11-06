import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** A company's current contacts, primary first, then the most recent. */
export const CURRENT_CONTACTS = {
  where: { endedAt: null },
  orderBy: [{ isPrimary: "desc" }, { startedAt: "desc" }],
} satisfies { where: Prisma.ContactWhereInput; orderBy: Prisma.ContactOrderByWithRelationInput[] };

export async function resolveDraftRecipient(
  tenantId: number,
  row: { toEmail: string | null; personId: number | null; companyId: number },
): Promise<string | null> {
  // Recipient resolution: explicit toEmail, else the linked person, else the
  // company's first current contact. The person lookup is scoped to this
  // tenant AND to the draft's company: `personId` arrives from an app-key
  // payload and is not otherwise proven to belong here. (Vanda, #88.)
  let to = row.toEmail?.trim() || null;
  if (!to && row.personId) {
    const contact = await db.contact.findFirst({
      where: { personId: row.personId, companyId: row.companyId, tenantId },
      select: { email: true, person: { select: { email: true } } },
    });
    to = contact?.email?.trim() || contact?.person.email?.trim() || null;
  }
  if (!to) {
    const contact = await db.contact.findFirst({
      where: { companyId: row.companyId, tenantId, ...CURRENT_CONTACTS.where },
      orderBy: CURRENT_CONTACTS.orderBy,
      select: { email: true, person: { select: { email: true } } },
    });
    to = contact?.email?.trim() || contact?.person.email?.trim() || null;
  }
  return to;
}
