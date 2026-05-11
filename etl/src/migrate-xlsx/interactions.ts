import { prisma } from '../lib/prisma';
import { readSheet, excelDateToJs, mapInteractionType, normalizeCompanyName } from '../lib/xlsx-utils';

// Column keys are the first xlsx row's cell values
const COL_TYPE = 'TELEFON';
const COL_VAT = '10338818242';
const COL_NAME = 'TECHNOKOV KFT.';
const COL_NOTES = 'LEAD';
const COL_OUTCOME = 'LOST';
const COL_DATE = '2023/02/28 08:05:00';

export async function migrateInteractions(
  tenantId: number,
  migrationUserId: number,
  nameMap: Map<string, number>,
  vatMap: Map<string, number>,
): Promise<number> {
  const rows = readSheet('20240125_accounts.xlsx', 'Munka11');
  console.log(`  [interactions] ${rows.length} rows read`);

  let loaded = 0;
  let skipped = 0;

  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await prisma.$transaction(
      async (tx) => {
        for (const row of chunk) {
          const vatRaw = row[COL_VAT];
          const vatNumber = vatRaw ? String(vatRaw) : null;
          const companyName = row[COL_NAME] as string | null;
          const dateSerial = row[COL_DATE];

          let companyId: number | undefined;
          if (vatNumber) companyId = vatMap.get(vatNumber);
          if (!companyId && companyName)
            companyId = nameMap.get(normalizeCompanyName(companyName));
          if (!companyId) { skipped++; continue; }

          const occurredAt = excelDateToJs(dateSerial);
          if (!occurredAt) { skipped++; continue; }

          await tx.interaction.create({
            data: {
              tenantId,
              companyId,
              userId: migrationUserId,
              type: mapInteractionType(row[COL_TYPE]),
              notes: (row[COL_NOTES] as string | null) ?? null,
              outcome: (row[COL_OUTCOME] as string | null) ?? null,
              occurredAt,
            },
          });
          loaded++;
        }
      },
      { timeout: 30_000 },
    );
  }

  console.log(`  [interactions] loaded=${loaded} skipped=${skipped}`);
  return loaded;
}
