import { prisma } from '../lib/prisma';
import { withSourceClient } from '../lib/source-db';

interface SourceCompany {
  id: number;
  name: string;
  vat_number: string | null;
  short_code: string | null;
  status: string | null;
  pipeline_status: string | null;
  account_type: string | null;
  industry_code: string | null;
  country: string | null;
  county: string | null;
  city: string | null;
  address: string | null;
  zip_code: string | null;
  website: string | null;
  last_interaction_date: Date | null;
  last_interaction_owner: string | null;
}

function mapStatus(raw: string | null): string | null {
  if (!raw) return null;
  if (raw === 'active') return 'active';
  if (raw === 'F.A.') return 'fa';
  return 'inactive';
}

/**
 * Migrates all companies from source → destination.
 * Returns a Map of sourceId → destination company id for use by subsequent steps.
 */
export async function migrateCompanies(
  tenantId: number,
): Promise<{ count: number; idMap: Map<number, number> }> {
  const rows = await withSourceClient((client) =>
    client.query<SourceCompany>('SELECT * FROM companies ORDER BY id').then((r) => r.rows),
  );

  console.log(`  [companies] ${rows.length} rows read from source`);

  const idMap = new Map<number, number>();
  let upserted = 0;
  let created = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const data = {
        tenantId,
        name: row.name,
        shortCode: row.short_code ?? null,
        status: mapStatus(row.status),
        pipelineStatus: row.pipeline_status ?? null,
        accountType: row.account_type ?? null,
        industryCode: row.industry_code ?? null,
        country: row.country ?? null,
        county: row.county ?? null,
        city: row.city ?? null,
        address: row.address ?? null,
        zipCode: row.zip_code ?? null,
        website: row.website ?? null,
        lastInteractionDate: row.last_interaction_date ?? null,
        lastInteractionOwner: row.last_interaction_owner ?? null,
      };

      if (row.vat_number) {
        // Dedup on tenantId + vatNumber
        const company = await tx.company.upsert({
          where: { tenantId_vatNumber: { tenantId, vatNumber: row.vat_number } },
          create: { ...data, vatNumber: row.vat_number },
          update: { ...data, vatNumber: row.vat_number },
          select: { id: true },
        });
        idMap.set(row.id, company.id);
        upserted++;
      } else {
        // No VAT — create unconditionally (no dedup key available)
        const company = await tx.company.create({
          data: { ...data, vatNumber: null },
          select: { id: true },
        });
        idMap.set(row.id, company.id);
        created++;
      }
    }
  }, { timeout: 60_000 });

  console.log(`  [companies] upserted=${upserted} created=${created} total=${upserted + created}`);
  return { count: upserted + created, idMap };
}
