import { prisma } from '../lib/prisma';
import {
  readSheet,
  excelDateToJs,
  mapStatus,
  parsePipelineStatus,
  normalizeCompanyName,
} from '../lib/xlsx-utils';

// Long multiline key from CLIENTS xlsx pipeline status column
const PIPELINE_COL =
  '0 - KUKA\r\n1 - NEM HÍVTUK\r\n2 - HÍVTUK, NEM ÉRTÜK EL\r\n3 - HÍVTUK, BESZÉLJÜNK!\r\n4 - HÍVTUK, NEM KELL\r\n5 - HÍVTUK, KELL\r\n6 - KIMENT, PENDING\r\n7 - KIMENT, CL\r\n8 - KIMENT, CW';

interface PipelineInfo {
  pipelineStatus: string | null;
  lastInteractionOwner: string | null;
  lastInteractionDate: Date | null;
}

function buildPipelineMap(): Map<string, PipelineInfo> {
  const rows = readSheet('20250228_CLIENTS.xlsx', 'XXXXXX');
  const map = new Map<string, PipelineInfo>();
  for (const row of rows) {
    const name = row['CÉG'] as string | null;
    if (!name) continue;
    map.set(normalizeCompanyName(name), {
      pipelineStatus: parsePipelineStatus(row[PIPELINE_COL]),
      lastInteractionOwner: (row['Utolsó Interakció felelőse'] as string | null) ?? null,
      lastInteractionDate: excelDateToJs(row['Utolsó interakció dátuma']),
    });
  }
  return map;
}

export interface CompanyMaps {
  count: number;
  nameMap: Map<string, number>; // normalizedName → companyId
  vatMap: Map<string, number>;  // vatNumber string → companyId
}

export async function migrateCompanies(tenantId: number): Promise<CompanyMaps> {
  const pipelineMap = buildPipelineMap();
  const rows = readSheet('20240125_accounts.xlsx', 'ACCOUNTS');

  // Row 0 in data is the label descriptor row (name field = "CÉG NÉV") — skip it
  const dataRows = rows.filter((r) => {
    const name = r['1696'] as string | null;
    return name && name !== 'CÉG NÉV' && String(name).trim() !== '';
  });

  console.log(`  [companies] ${dataRows.length} data rows`);

  const nameMap = new Map<string, number>();
  const vatMap = new Map<string, number>();
  let upserted = 0;
  let created = 0;

  const CHUNK = 200;
  for (let i = 0; i < dataRows.length; i += CHUNK) {
    const chunk = dataRows.slice(i, i + CHUNK);
    await prisma.$transaction(
      async (tx) => {
        for (const row of chunk) {
          const name = String(row['1696'] ?? '').trim();
          if (!name) continue;

          const vatRaw = row['1696_1'];
          const vatNumber = vatRaw ? String(vatRaw).trim() : null;
          const normalizedName = normalizeCompanyName(name);
          const pl = pipelineMap.get(normalizedName);

          const websiteRaw = row['__EMPTY_7'];
          const website =
            websiteRaw && typeof websiteRaw === 'string' && websiteRaw.includes('.')
              ? websiteRaw
              : null;

          const data = {
            tenantId,
            name,
            shortCode: (row['1696_2'] as string | null) ?? null,
            status: mapStatus(row['1661']),
            accountType: (row['__EMPTY_2'] as string | null) ?? null,
            industryCode: (row['__EMPTY_15'] as string | null) ?? null,
            country: (row['__EMPTY_6'] as string | null) ?? null,
            county: (row['__EMPTY_57'] as string | null) ?? null,
            city: (row['__EMPTY_55'] as string | null) ?? null,
            address: (row['__EMPTY_56'] as string | null) ?? null,
            zipCode: row['__EMPTY_54'] ? String(row['__EMPTY_54']) : null,
            website,
            pipelineStatus: pl?.pipelineStatus ?? null,
            lastInteractionDate:
              pl?.lastInteractionDate ?? excelDateToJs(row['KAPCSOLAT']),
            lastInteractionOwner: pl?.lastInteractionOwner ?? null,
          };

          if (vatNumber) {
            const company = await tx.company.upsert({
              where: { tenantId_vatNumber: { tenantId, vatNumber } },
              create: { ...data, vatNumber },
              update: { ...data, vatNumber },
              select: { id: true },
            });
            nameMap.set(normalizedName, company.id);
            vatMap.set(vatNumber, company.id);
            upserted++;
          } else {
            const company = await tx.company.create({
              data: { ...data, vatNumber: null },
              select: { id: true },
            });
            nameMap.set(normalizedName, company.id);
            created++;
          }
        }
      },
      { timeout: 60_000 },
    );
  }

  console.log(`  [companies] upserted=${upserted} created=${created} total=${upserted + created}`);
  return { count: upserted + created, nameMap, vatMap };
}
