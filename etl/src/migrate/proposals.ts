import { prisma } from '../lib/prisma';
import { withSourceClient } from '../lib/source-db';

interface SourceProposal {
  id: number;
  company_id: number | null;
  company_name: string | null;
  result: string | null;
  lost_reason: string | null;
  campaign: string | null;
  sent_date: Date | null;
  received_date: Date | null;
  invoice_number: string | null;
  raw_label: string | null;
  raw_source_file: string | null;
}

export async function migrateProposals(
  tenantId: number,
  companyIdMap: Map<number, number>,
): Promise<number> {
  const rows = await withSourceClient((client) =>
    client
      .query<SourceProposal>('SELECT * FROM proposals ORDER BY id')
      .then((r) => r.rows),
  );

  console.log(`  [proposals] ${rows.length} rows read from source`);

  let created = 0;
  let unmatched = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const destCompanyId = row.company_id ? companyIdMap.get(row.company_id) ?? null : null;

      if (destCompanyId === null) {
        console.log(`  [proposals] WARN: no dest company for source company_id=${row.company_id} (name="${row.company_name}")`);
        unmatched++;
        continue; // companyId is required on Proposal
      }

      await tx.proposal.create({
        data: {
          tenantId,
          companyId: destCompanyId,
          dealId: null,
          result: row.result ?? null,
          lostReason: row.lost_reason ?? null,
          campaign: row.campaign ?? null,
          sentDate: row.sent_date ?? null,
          receivedDate: row.received_date ?? null,
          invoiceNumber: row.invoice_number ?? null,
          rawLabel: row.raw_label ?? null,
          rawSourceFile: row.raw_source_file ?? null,
        },
      });
      created++;
    }
  }, { timeout: 60_000 });

  if (unmatched > 0) {
    console.log(`  [proposals] ${unmatched} rows skipped (unmatched company) — flag for review`);
  }
  console.log(`  [proposals] created=${created}`);
  return created;
}
