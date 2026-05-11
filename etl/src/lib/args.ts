export interface CliArgs {
  dryRun: boolean;
  reset: boolean;
  tenantId: number;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const dryRun = argv.includes('--dry-run');
  const reset = argv.includes('--reset');

  const tenantIdIndex = argv.indexOf('--tenant-id');
  const tenantId =
    tenantIdIndex !== -1 && argv[tenantIdIndex + 1]
      ? parseInt(argv[tenantIdIndex + 1], 10)
      : 1;

  if (isNaN(tenantId) || tenantId < 1) {
    throw new Error(`Invalid --tenant-id value: ${argv[tenantIdIndex + 1]}`);
  }

  return { dryRun, reset, tenantId };
}
