import 'dotenv/config';
import { prisma } from './lib/prisma';
import { sourcePool } from './lib/source-db';

const TENANT_ID = 1;

const EXPECTED: Record<string, number> = {
  companies: 2255,
  persons: 137,
  contacts: 137,
  interactions: 713,
  proposals: 266,
  invoices: 2225,
  leads: 118,
};

async function main(): Promise<void> {
  console.log('\nNDT CRM — Post-Migration Validation\n');

  // Source counts
  const sourceTables = ['companies', 'contacts', 'interactions', 'proposals', 'invoices', 'leads'];
  const source: Record<string, number> = {};
  for (const t of sourceTables) {
    const r = await sourcePool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
    source[t] = r.rows[0].n;
  }

  // Destination counts
  const dest: Record<string, number> = {
    companies:    await prisma.company.count({ where: { tenantId: TENANT_ID } }),
    persons:      await prisma.person.count({ where: { tenantId: TENANT_ID } }),
    contacts:     await prisma.contact.count({ where: { tenantId: TENANT_ID } }),
    interactions: await prisma.interaction.count({ where: { tenantId: TENANT_ID } }),
    proposals:    await prisma.proposal.count({ where: { tenantId: TENANT_ID } }),
    invoices:     await prisma.invoice.count({ where: { tenantId: TENANT_ID } }),
    leads:        await prisma.lead.count({ where: { tenantId: TENANT_ID } }),
  };

  // Print comparison table
  const col = (s: string, w: number) => s.padEnd(w);
  console.log(
    col('entity', 16) +
    col('source', 10) +
    col('dest', 10) +
    col('expected', 10) +
    'status',
  );
  console.log('─'.repeat(62));

  let hasWarning = false;

  for (const entity of Object.keys(dest)) {
    const src = source[entity] ?? '—';
    const d = dest[entity];
    const exp = EXPECTED[entity] ?? '?';
    const ok = typeof exp === 'number' ? Math.abs(d - exp) <= exp * 0.05 : true; // within 5%
    const status = ok ? '✅' : '⚠️  MISMATCH';
    if (!ok) hasWarning = true;

    console.log(
      col(entity, 16) +
      col(String(src), 10) +
      col(String(d), 10) +
      col(String(exp), 10) +
      status,
    );
  }

  console.log('─'.repeat(62));

  if (hasWarning) {
    console.log('\n⚠️  Some counts deviate >5% from expected. Flag for manual review.');
  } else {
    console.log('\n✅ All counts within expected range.');
  }

  // Latest ETL run summary
  const lastRun = await prisma.etlRun.findFirst({
    where: { tenantId: TENANT_ID },
    orderBy: { startedAt: 'desc' },
  });
  if (lastRun) {
    console.log(`\nLast ETL run: id=${lastRun.id} status=${lastRun.status} started=${lastRun.startedAt.toISOString()}`);
    if (lastRun.errorMessage) console.log(`  error: ${lastRun.errorMessage}`);
  }

  await sourcePool.end();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
