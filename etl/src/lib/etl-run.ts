import { prisma } from './prisma';

export interface EntityCounts {
  companiesLoaded?: number;
  personsLoaded?: number;
  contactsLoaded?: number;
  interactionsLoaded?: number;
  proposalsLoaded?: number;
  invoicesLoaded?: number;
  leadsLoaded?: number;
}

export interface EtlRunHandle {
  id: number;
  finish: (counts: EntityCounts, errorMessage?: string) => Promise<void>;
}

export async function startEtlRun(tenantId: number, dryRun: boolean): Promise<EtlRunHandle> {
  const label = dryRun ? 'db-migration-dry-run' : 'db-migration';

  const run = await prisma.etlRun.create({
    data: {
      tenantId,
      filename: label,
      status: 'running',
    },
  });

  const finish = async (counts: EntityCounts, errorMessage?: string): Promise<void> => {
    await prisma.etlRun.update({
      where: { id: run.id },
      data: {
        status: errorMessage ? 'error' : 'success',
        companiesLoaded: counts.companiesLoaded ?? 0,
        invoicesLoaded: counts.invoicesLoaded ?? 0,
        leadsLoaded: counts.leadsLoaded ?? 0,
        proposalsLoaded: counts.proposalsLoaded ?? 0,
        interactionsLoaded: counts.interactionsLoaded ?? 0,
        errorMessage: errorMessage ?? null,
        completedAt: new Date(),
      },
    });
  };

  return { id: run.id, finish };
}
