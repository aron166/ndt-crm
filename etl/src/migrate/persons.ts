import { prisma } from '../lib/prisma';
import { withSourceClient } from '../lib/source-db';

interface SourceContact {
  id: number;
  company_id: number | null;
  name: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Splits a full name into firstName + lastName.
 * Everything before the first space = firstName; the rest = lastName.
 * If no space, the whole string = lastName.
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return { firstName: '', lastName: trimmed };
  return {
    firstName: trimmed.slice(0, spaceIdx),
    lastName: trimmed.slice(spaceIdx + 1),
  };
}

export interface PersonsMigrationResult {
  personsCreated: number;
  personsReused: number;
  contactsCreated: number;
}

/**
 * Migrates source contacts → destination persons + contacts.
 *
 * Strategy:
 * - Each source row → 1 Person + 1 Contact (person ↔ company link)
 * - Dedup persons on email: if a Person with that email already exists, reuse it
 * - If email is null, always create a new Person (no dedup key available)
 * - Contact.startedAt / endedAt = null (no historical dates in source)
 */
export async function migratePersons(
  tenantId: number,
  companyIdMap: Map<number, number>,
): Promise<PersonsMigrationResult> {
  const rows = await withSourceClient((client) =>
    client
      .query<SourceContact>('SELECT id, company_id, name, phone, email FROM contacts ORDER BY id')
      .then((r) => r.rows),
  );

  console.log(`  [persons] ${rows.length} source contacts to process`);

  let personsCreated = 0;
  let personsReused = 0;
  let contactsCreated = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      // Skip rows with no name and no email — nothing to create a person from
      if (!row.name && !row.email) {
        skipped++;
        continue;
      }

      const { firstName, lastName } = splitName(row.name ?? row.email ?? 'Unknown');

      // Resolve destination company id
      const destCompanyId = row.company_id ? companyIdMap.get(row.company_id) ?? null : null;

      // --- Person: dedup on email ---
      let personId: number;

      if (row.email) {
        const existing = await tx.person.findFirst({
          where: { tenantId, email: row.email },
          select: { id: true },
        });

        if (existing) {
          personId = existing.id;
          personsReused++;
        } else {
          const created = await tx.person.create({
            data: { tenantId, firstName, lastName, email: row.email, phone: row.phone ?? null },
            select: { id: true },
          });
          personId = created.id;
          personsCreated++;
        }
      } else {
        // No email — always create
        const created = await tx.person.create({
          data: { tenantId, firstName, lastName, email: null, phone: row.phone ?? null },
          select: { id: true },
        });
        personId = created.id;
        personsCreated++;
      }

      // --- Contact: link person ↔ company (only if we have a company) ---
      if (destCompanyId !== null) {
        await tx.contact.create({
          data: {
            tenantId,
            personId,
            companyId: destCompanyId,
            email: row.email ?? null,
            phone: row.phone ?? null,
            startedAt: null,
            endedAt: null,
          },
        });
        contactsCreated++;
      }
    }
  }, { timeout: 60_000 });

  if (skipped > 0) {
    console.log(`  [persons] skipped ${skipped} rows (no name + no email)`);
  }
  console.log(
    `  [persons] personsCreated=${personsCreated} personsReused=${personsReused} ` +
    `contactsCreated=${contactsCreated}`,
  );

  return { personsCreated, personsReused, contactsCreated };
}
