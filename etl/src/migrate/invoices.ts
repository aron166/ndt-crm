import { prisma } from '../lib/prisma';
import { withSourceClient } from '../lib/source-db';

interface SourceInvoice {
  id: number;
  company_id: number | null;
  company_name: string | null;
  invoice_number: string | null;
  net_amount: string | null; // pg returns numeric as string
  currency: string | null;
  completion_date: Date | null;
  issued_date: Date | null;
  due_date: Date | null;
  year: number | null;
  raw_source_file: string | null;
}

export async function migrateInvoices(
  tenantId: number,
  companyIdMap: Map<number, number>,
): Promise<number> {
  const rows = await withSourceClient((client) =>
    client
      .query<SourceInvoice>('SELECT * FROM invoices ORDER BY id')
      .then((r) => r.rows),
  );

  console.log(`  [invoices] ${rows.length} rows read from source`);

  let created = 0;
  let unmatched = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const destCompanyId = row.company_id ? companyIdMap.get(row.company_id) ?? null : null;

      if (destCompanyId === null) {
        unmatched++;
      }

      await tx.invoice.create({
        data: {
          tenantId,
          companyId: destCompanyId, // nullable — historical records may not link
          companyName: row.company_name ?? null,
          invoiceNumber: row.invoice_number ?? null,
          netAmount: row.net_amount ? parseFloat(row.net_amount) : null,
          currency: row.currency ?? 'HUF',
          completionDate: row.completion_date ?? null,
          issuedDate: row.issued_date ?? null,
          dueDate: row.due_date ?? null,
          year: row.year ?? null,
          rawSourceFile: row.raw_source_file ?? null,
        },
      });
      created++;
    }
  }, { timeout: 120_000 });

  if (unmatched > 0) {
    console.log(`  [invoices] ${unmatched} rows had no matching company (companyId=null, preserved via companyName)`);
  }
  console.log(`  [invoices] created=${created}`);
  return created;
}
