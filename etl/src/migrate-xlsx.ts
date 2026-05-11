import 'dotenv/config';
import { parseArgs } from './lib/args';
import { prisma } from './lib/prisma';
import { startEtlRun, EntityCounts } from './lib/etl-run';
import { seedMigrationUser } from './lib/seed-migration-user';
import { migrateCompanies } from './migrate-xlsx/companies';
import { migrateProposals } from './migrate-xlsx/proposals';
import { migrateInteractions } from './migrate-xlsx/interactions';
import { migrateInvoices } from './migrate-xlsx/invoices';

async function main(): Promise<void> {
  const args = parseArgs();

  console.log(`\nNDT CRM — XLSX Migration (no source DB required)`);
  console.log(`  tenant-id : ${args.tenantId}`);
  console.log(`  dry-run   : ${args.dryRun}`);
  console.log('');

  if (args.dryRun) {
    console.log('[DRY RUN] No writes performed.');
    await prisma.$disconnect();
    return;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: args.tenantId } });
  if (!tenant) {
    throw new Error(
      `Tenant id=${args.tenantId} not found. Run backend seed first: cd backend && npx ts-node prisma/seed.ts`,
    );
  }

  if (args.reset) {
    console.log('--reset: clearing migrated tables...');
    await prisma.$transaction([
      prisma.interaction.deleteMany({ where: { tenantId: args.tenantId } }),
      prisma.contact.deleteMany({ where: { tenantId: args.tenantId } }),
      prisma.proposal.deleteMany({ where: { tenantId: args.tenantId } }),
      prisma.invoice.deleteMany({ where: { tenantId: args.tenantId } }),
      prisma.lead.deleteMany({ where: { tenantId: args.tenantId } }),
      prisma.person.deleteMany({ where: { tenantId: args.tenantId } }),
      prisma.company.deleteMany({ where: { tenantId: args.tenantId } }),
    ]);
    console.log('  tables cleared.\n');
  }

  const migrationUserId = await seedMigrationUser(args.tenantId);
  const etlRun = await startEtlRun(args.tenantId, args.dryRun);
  console.log(`ETL run id=${etlRun.id} started.\n`);

  const counts: EntityCounts = {};

  try {
    const { count: companiesCount, nameMap, vatMap } = await migrateCompanies(args.tenantId);
    counts.companiesLoaded = companiesCount;
    console.log(`  companies done: ${companiesCount}\n`);

    counts.proposalsLoaded = await migrateProposals(args.tenantId, nameMap);
    console.log(`  proposals done: ${counts.proposalsLoaded}\n`);

    counts.interactionsLoaded = await migrateInteractions(
      args.tenantId,
      migrationUserId,
      nameMap,
      vatMap,
    );
    console.log(`  interactions done: ${counts.interactionsLoaded}\n`);

    counts.invoicesLoaded = await migrateInvoices(args.tenantId, nameMap, vatMap);
    console.log(`  invoices done: ${counts.invoicesLoaded}\n`);

    await etlRun.finish(counts);
    console.log('ETL run completed successfully.');
    console.log(
      `  companies=${counts.companiesLoaded} proposals=${counts.proposalsLoaded} ` +
      `interactions=${counts.interactionsLoaded} invoices=${counts.invoicesLoaded}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('\nETL run failed:', message);
    await etlRun.finish(counts, message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
