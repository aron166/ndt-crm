import { prisma } from '../lib/prisma';
import { readSheet, excelDateToJs, normalizeCompanyName } from '../lib/xlsx-utils';

// Column keys are the first xlsx row's cell values
const COL_VAT = '14187360212';
const COL_NAME = 'LEL KFT.';
const COL_AMOUNT = '95,960.00 HUF';
const COL_INVOICE_NO = 'CLB-2023-29';
const COL_DATE = '2023/03/20 00:00:00';
const COL_YEAR = '2023';

export async function migrateInvoices(
  tenantId: number,
  nameMap: Map<string, number>,
  vatMap: Map<string, number>,
): Promise<number> {
  const rows = readSheet('20240125_accounts.xlsx', 'Munka9');
  console.log(`  [invoices] ${rows.length} rows read`);

  let loaded = 0;
  let skipped = 0;

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await prisma.$transaction(
      async (tx) => {
        for (const row of chunk) {
          const invoiceNumber = row[COL_INVOICE_NO] as string | null;
          if (!invoiceNumber) { skipped++; continue; }

          const vatRaw = row[COL_VAT];
          const vatNumber = vatRaw ? String(vatRaw) : null;
          const companyName = row[COL_NAME] as string | null;
          const amountRaw = row[COL_AMOUNT];
          const dateSerial = row[COL_DATE];
          const yearRaw = row[COL_YEAR];

          let companyId: number | undefined;
          if (vatNumber) companyId = vatMap.get(vatNumber);
          if (!companyId && companyName)
            companyId = nameMap.get(normalizeCompanyName(companyName));

          const issuedDate = excelDateToJs(dateSerial);
          const netAmount = amountRaw !== null ? Number(amountRaw) : null;
          const year = yearRaw
            ? Number(yearRaw)
            : (issuedDate?.getUTCFullYear() ?? null);

          await tx.invoice.create({
            data: {
              tenantId,
              companyId: companyId ?? null,
              companyName: companyName ?? null,
              invoiceNumber,
              netAmount: netAmount !== null && !isNaN(netAmount) ? netAmount : null,
              currency: 'HUF',
              issuedDate,
              year,
              rawSourceFile: '20240125_accounts.xlsx::Munka9',
            },
          });
          loaded++;
        }
      },
      { timeout: 60_000 },
    );
  }

  console.log(`  [invoices] loaded=${loaded} skipped=${skipped}`);
  return loaded;
}
