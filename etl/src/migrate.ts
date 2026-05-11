import 'dotenv/config';
import { parseArgs } from './lib/args';
import { prisma } from './lib/prisma';
import { sourcePool } from './lib/source-db';
import { startEtlRun, EntityCounts } from './lib/etl-run';
import { seedMigrationUser } from './lib/seed-migration-user';
import { migrateCompanies } from './migrate/companies';
import { migratePersons } from './migrate/persons';
import { migrateInteractions } from './migrate/interactions';
import { migrateProposals } from './migrate/proposals';
import { migrateInvoices } from './migrate/invoices';
import { migrateLeads } from './migrate/leads';

async function getSourceCounts(): Promise<Record<string, number>> {
  const tables = ['companies', 'contacts', 'interactions', 'proposals', 'invoices', 'leads'];
  const counts: Record<string, number> = {};

  for (const table of tables) {
    const result = await sourcePool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    counts[table] = result.rows[0].n;
  }

  return counts;
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log(`\nNDT CRM — DB Migration`);
  console.log(`  tenant-id : ${args.tenantId}`);
  console.log(`  dry-run   : ${args.dryRun}`);
  console.log('');

  // Verify source DB connectivity and print counts
  console.log('Checking source DB counts...');
  const sourceCounts = await getSourceCounts();
  for (const [table, count] of Object.entries(sourceCounts)) {
    console.log(`  source.${table.padEnd(14)} ${count}`);
  }
  console.log('');

  if (args.dryRun) {
    console.log('[DRY RUN] Validation complete. No writes performed.');
    await sourcePool.end();
    await prisma.$disconnect();
    return;
  }

  // Ensure tenant 1 exists (must be seeded before ETL)
  const tenant = await prisma.tenant.findUnique({ where: { id: args.tenantId } });
  if (!tenant) {
    throw new Error(
      `Tenant id=${args.tenantId} not found in destination DB. ` +
      `Run backend seed first: cd backend && npx ts-node prisma/seed.ts`,
    );
  }

  // Reset: clear all migrated tables before re-running (order respects FK constraints)
  if (args.reset) {
    console.log('--reset: clearing migrated tables...');
    await prisma.$transaction([
      prisma.interaction.deleteMany({ where: { tenantId: args.tenantId } }),
      prisma.contact.deleteMany({ where: { tenantId: args.tenantId } }),
      prisma.lead.deleteMany({ where: { tenantId: args.tenantId } }),
      prisma.proposal.deleteMany({ where: { tenantId: args.tenantId } }),
      prisma.invoice.deleteMany({ where: { tenantId: args.tenantId } }),
      prisma.person.deleteMany({ where: { tenantId: args.tenantId } }),
      prisma.company.deleteMany({ where: { tenantId: args.tenantId } }),
    ]);
    console.log('  tables cleared.\n');
  }

  // Seed migration user — id needed for interactions
  const migrationUserId = await seedMigrationUser(args.tenantId);

  // Start ETL run audit record
  const etlRun = await startEtlRun(args.tenantId, args.dryRun);
  console.log(`ETL run id=${etlRun.id} started.\n`);

  const counts: EntityCounts = {};

  try {
    const { count: companiesCount, idMap: companyIdMap } = await migrateCompanies(args.tenantId);
    counts.companiesLoaded = companiesCount;
    console.log(`  companies done: ${companiesCount}\n`);

    const personsResult = await migratePersons(args.tenantId, companyIdMap);
    console.log(
      `  persons done: created=${personsResult.personsCreated} ` +
      `reused=${personsResult.personsReused} contacts=${personsResult.contactsCreated}\n`,
    );

    counts.interactionsLoaded = await migrateInteractions(args.tenantId, companyIdMap, migrationUserId);
    console.log(`  interactions done: ${counts.interactionsLoaded}\n`);

    counts.proposalsLoaded = await migrateProposals(args.tenantId, companyIdMap);
    console.log(`  proposals done: ${counts.proposalsLoaded}\n`);

    counts.invoicesLoaded = await migrateInvoices(args.tenantId, companyIdMap);
    console.log(`  invoices done: ${counts.invoicesLoaded}\n`);

    counts.leadsLoaded = await migrateLeads(args.tenantId, companyIdMap);
    console.log(`  leads done: ${counts.leadsLoaded}\n`);

    await etlRun.finish(counts);
    console.log('ETL run completed successfully.');
    console.log(`  companies=${counts.companiesLoaded} interactions=${counts.interactionsLoaded} proposals=${counts.proposalsLoaded} invoices=${counts.invoicesLoaded} leads=${counts.leadsLoaded}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('\nETL run failed:', message);
    await etlRun.finish(counts, message);
    process.exitCode = 1;
  } finally {
    await sourcePool.end();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
