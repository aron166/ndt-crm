import 'dotenv/config';
import { parseArgs } from './lib/args';
import { prisma } from './lib/prisma';
import { enrichCompanies } from './migrate-xlsx/enrich-companies';

async function main(): Promise<void> {
  const args = parseArgs();

  console.log(`\nNDT CRM — Company Enrichment (from MAIN sheet)`);
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
    throw new Error(`Tenant id=${args.tenantId} not found.`);
  }

  try {
    const count = await enrichCompanies(args.tenantId);
    console.log(`\nEnrichment complete. ${count} companies updated.`);
  } catch (err) {
    console.error('Enrichment failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
