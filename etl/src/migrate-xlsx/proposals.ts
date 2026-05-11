import { prisma } from '../lib/prisma';
import {
  readSheet,
  excelDateToJs,
  yyyymmddToDate,
  mapProposalResult,
  normalizeCompanyName,
} from '../lib/xlsx-utils';

export async function migrateProposals(
  tenantId: number,
  nameMap: Map<string, number>,
): Promise<number> {
  const rows = readSheet('20240125_accounts.xlsx', 'PROPOSALS');
  console.log(`  [proposals] ${rows.length} rows read`);

  let loaded = 0;
  let skipped = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        const companyName = row['account'] as string | null;
        if (!companyName) { skipped++; continue; }

        const companyId = nameMap.get(normalizeCompanyName(companyName));
        if (!companyId) { skipped++; continue; }

        await tx.proposal.create({
          data: {
            tenantId,
            companyId,
            result: mapProposalResult(row['result']),
            lostReason: (row['reason'] as string | null) ?? null,
            campaign: (row['KAMPÁNY'] as string | null) ?? null,
            sentDate: excelDateToJs(row['date_sent']) ?? yyyymmddToDate(row['küldött']),
            receivedDate: yyyymmddToDate(row['érkezett']),
            rawLabel: (row['__EMPTY_1'] as string | null) ?? null,
            rawSourceFile: '20240125_accounts.xlsx::PROPOSALS',
          },
        });
        loaded++;
      }
    },
    { timeout: 60_000 },
  );

  console.log(`  [proposals] loaded=${loaded} skipped=${skipped}`);
  return loaded;
}
