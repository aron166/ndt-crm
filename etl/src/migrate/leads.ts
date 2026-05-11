import { prisma } from '../lib/prisma';
import { withSourceClient } from '../lib/source-db';

interface SourceLead {
  id: number;
  company_id: number | null;
  lead_source: string | null;
  lead_status: string | null;
  subject: string | null;
  service_interest: string | null;
  received_date: Date | null;
  lost_reason: string | null;
  estimated_value: string | null; // pg returns numeric as string
  raw_source_file: string | null;
}

export async function migrateLeads(
  tenantId: number,
  companyIdMap: Map<number, number>,
): Promise<number> {
  const rows = await withSourceClient((client) =>
    client
      .query<SourceLead>(
        `SELECT id, company_id, lead_source, lead_status, subject,
                service_interest, received_date, lost_reason,
                estimated_value, raw_source_file
         FROM leads ORDER BY id`,
      )
      .then((r) => r.rows),
  );

  console.log(`  [leads] ${rows.length} rows read from source`);

  let created = 0;
  let unmatched = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const destCompanyId = row.company_id ? companyIdMap.get(row.company_id) ?? null : null;

      if (destCompanyId === null) unmatched++;

      await tx.lead.create({
        data: {
          tenantId,
          companyId: destCompanyId,
          source: row.lead_source ?? null,
          status: row.lead_status ?? null,
          subject: row.subject ?? null,
          serviceInterest: row.service_interest ?? null,
          receivedDate: row.received_date ?? null,
          lostReason: row.lost_reason ?? null,
          estimatedValue: row.estimated_value ? parseFloat(row.estimated_value) : null,
          rawSourceFile: row.raw_source_file ?? null,
        },
      });
      created++;
    }
  }, { timeout: 60_000 });

  if (unmatched > 0) {
    console.log(`  [leads] ${unmatched} rows had no matching company`);
  }
  console.log(`  [leads] created=${created}`);
  return created;
}
