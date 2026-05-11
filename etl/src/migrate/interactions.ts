import { prisma } from '../lib/prisma';
import { withSourceClient } from '../lib/source-db';

interface SourceInteraction {
  id: number;
  company_id: number | null;
  pipeline_status: string | null;
  interaction_date: Date | null;
  notes: string | null;
  created_at: Date;
}

export async function migrateInteractions(
  tenantId: number,
  companyIdMap: Map<number, number>,
  migrationUserId: number,
): Promise<number> {
  const rows = await withSourceClient((client) =>
    client
      .query<SourceInteraction>(
        `SELECT id, company_id, pipeline_status, interaction_date, notes, created_at
         FROM interactions ORDER BY id`,
      )
      .then((r) => r.rows),
  );

  console.log(`  [interactions] ${rows.length} rows read from source`);

  let created = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const destCompanyId = row.company_id ? companyIdMap.get(row.company_id) ?? null : null;

      // occurredAt: use interaction_date if present, else created_at
      const occurredAt = row.interaction_date ?? row.created_at;

      await tx.interaction.create({
        data: {
          tenantId,
          companyId: destCompanyId,
          personId: null,        // source has no person link
          userId: migrationUserId,
          type: null,
          direction: null,
          notes: row.notes ?? null,
          outcome: row.pipeline_status ?? null,
          occurredAt,
        },
      });

      if (destCompanyId === null) skipped++;
      created++;
    }
  }, { timeout: 60_000 });

  if (skipped > 0) {
    console.log(`  [interactions] ${skipped} rows had no matching company (companyId=null)`);
  }
  console.log(`  [interactions] created=${created}`);
  return created;
}
