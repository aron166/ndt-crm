import { prisma } from '../lib/prisma';
import { readSheet, normalizeCompanyName } from '../lib/xlsx-utils';

// MAIN sheet column key → field
// Row 0 of MAIN is used as header by sheet_to_json; row 1 is the descriptor (skipped as dataRows[0])
const COL = {
  name:               '__EMPTY_1',
  vat:                '__EMPTY_6',
  euVat:              '__EMPTY_7',
  leadSource:         '__EMPTY_8',
  warmth:             '__EMPTY_19',
  partnerCategory:    '1,407,040,519 Ft',
  revenue2019:        '__EMPTY_20',
  revenue2020:        '__EMPTY_21',
  revenue2021:        '__EMPTY_22',
  revenue2022:        '__EMPTY_23',
  revenue2023:        '__EMPTY_24',
  revenue2024:        '__EMPTY_25',
  customerValue:      '1,407,040,519 Ft_1',
  linkedinUrl:        '__EMPTY_35',
  teaorRaw:           '__EMPTY_38',  // "4399 Egyéb speciális szaképítés M.n.s."
  industryEn:         '__EMPTY_43',
  scopeOfActivity:    'TEVÉKENYSÉG',
  // Product areas (value = "X" or specific tag when applicable)
  paW:                'TERMÉKTERÜLET',
  paWp:               '__EMPTY_47',
  paF:                '__EMPTY_48',
  paC:                '__EMPTY_49',
  paT:                '__EMPTY_50',
  paP:                '__EMPTY_51',
  // Materials
  matFe:              'ANYAG',
  matAl:              '__EMPTY_57',
  matCu:              '__EMPTY_58',
  matAm:              '__EMPTY_60',
  // Products GYÁRTMÁNY_01-07
  prod1:              'TERMÉK',
  prod2:              '__EMPTY_63',
  prod3:              '__EMPTY_64',
  prod4:              '__EMPTY_65',
  prod5:              '__EMPTY_66',
  prod6:              '__EMPTY_67',
  prod7:              '__EMPTY_68',
  isPed:              '__EMPTY_69',
  // NDT methods (YES/NO/N/A)
  ndtVt:              '__EMPTY_74',
  ndtPt:              '__EMPTY_75',
  ndtMt:              '__EMPTY_76',
  ndtUt:              '__EMPTY_77',
  ndtRt:              '__EMPTY_78',
  ndtDrt:             '__EMPTY_79',
  ndtLt:              '__EMPTY_80',
  ndtHt:              '__EMPTY_81',
  ndtSpectro:         '__EMPTY_82',
  ndtConsultation:    '__EMPTY_83',
  inspectionFreq:     '__EMPTY_85',
  labType:            '__EMPTY_86',
  competitor1:        '__EMPTY_87',
  competitor2:        '__EMPTY_88',
  competitor3:        '__EMPTY_89',
  // TELEPHELY (operating address)
  siteZip:            '__EMPTY_98',
  siteCity:           '__EMPTY_99',
  siteStreet:         '__EMPTY_100',
  siteCounty:         '__EMPTY_101',
  siteCountry:        '__EMPTY_102',
} as const;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === 'N/A' || s === '#N/A' ? null : s;
}

function bigint(v: unknown): bigint | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (isNaN(n) || n === 0) return null;
  return BigInt(Math.round(n));
}

function isYes(v: unknown): boolean {
  return str(v) === 'YES';
}

function isMark(v: unknown): boolean {
  const s = str(v);
  return s !== null && s !== 'Z' && s !== 'NO';
}

function parseTeaor(raw: unknown): { code: string | null; description: string | null } {
  const s = str(raw);
  if (!s) return { code: null, description: null };
  const spaceIdx = s.indexOf(' ');
  if (spaceIdx === -1) return { code: s, description: null };
  return { code: s.slice(0, spaceIdx), description: s.slice(spaceIdx + 1) };
}

function parseLabType(v: unknown): boolean | null {
  const s = str(v);
  if (!s) return null;
  if (s.toLowerCase().includes('belső')) return true;
  if (s.toLowerCase().includes('külső')) return false;
  return null;
}

function collectList(
  row: Record<string, unknown>,
  entries: Array<{ key: string; label: string }>,
  checker: (v: unknown) => boolean,
): string[] {
  const result: string[] = [];
  for (const { key, label } of entries) {
    if (checker(row[key])) result.push(label);
  }
  return result;
}

export async function enrichCompanies(tenantId: number): Promise<number> {
  const rows = readSheet('20240125_accounts.xlsx', 'MAIN');

  // Skip the descriptor row (row 0 in data = row 1 in xlsx = column labels)
  const dataRows = rows.filter((r) => {
    const name = r[COL.name] as string | null;
    return name && name !== 'Company' && String(name).trim() !== '';
  });

  console.log(`  [enrich-companies] ${dataRows.length} rows in MAIN`);

  let updated = 0;
  let notFound = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const name = str(row[COL.name]);
    const vatRaw = str(row[COL.vat]);
    const vatNumber = vatRaw ? vatRaw.replace(/-/g, '').slice(0, 11) : null;

    let companyId: number | null = null;
    if (vatNumber) {
      const hit = await prisma.company.findFirst({
        where: { tenantId, vatNumber },
        select: { id: true },
      });
      if (hit) companyId = hit.id;
    }
    if (!companyId && name) {
      const hit = await prisma.company.findFirst({
        where: { tenantId, name },
        select: { id: true },
      });
      if (hit) companyId = hit.id;
    }
    if (!companyId) {
      notFound++;
      if ((i + 1) % 100 === 0) process.stdout.write(`\r  [enrich-companies] ${i + 1}/${dataRows.length}`);
      continue;
    }

    const teaor = parseTeaor(row[COL.teaorRaw]);

    const ndtMethods = collectList(row, [
      { key: COL.ndtVt, label: 'VT' }, { key: COL.ndtPt, label: 'PT' },
      { key: COL.ndtMt, label: 'MT' }, { key: COL.ndtUt, label: 'UT' },
      { key: COL.ndtRt, label: 'RT' }, { key: COL.ndtDrt, label: 'DRT' },
      { key: COL.ndtLt, label: 'LT' }, { key: COL.ndtHt, label: 'HT' },
      { key: COL.ndtSpectro, label: 'SPECTRO' }, { key: COL.ndtConsultation, label: 'consultation' },
    ], isYes);

    const productAreas = collectList(row, [
      { key: COL.paW, label: 'w' }, { key: COL.paWp, label: 'wp' },
      { key: COL.paF, label: 'f' }, { key: COL.paC, label: 'c' },
      { key: COL.paT, label: 't' }, { key: COL.paP, label: 'p' },
    ], isMark);

    const materials = collectList(row, [
      { key: COL.matFe, label: 'Fe' }, { key: COL.matAl, label: 'Al' },
      { key: COL.matCu, label: 'Cu' }, { key: COL.matAm, label: 'AM' },
    ], isMark);

    const products = [
      str(row[COL.prod1]), str(row[COL.prod2]), str(row[COL.prod3]),
      str(row[COL.prod4]), str(row[COL.prod5]), str(row[COL.prod6]), str(row[COL.prod7]),
    ].filter((v): v is string => v !== null);

    const warmthRaw = str(row[COL.warmth]);
    const warmth = warmthRaw === 'COLD' ? 'cold' : warmthRaw === 'WARM' ? 'warm' : warmthRaw === 'HOT' ? 'hot' : null;

    await prisma.company.update({
      where: { id: companyId },
      data: {
        euVatNumber:         str(row[COL.euVat]),
        leadSource:          str(row[COL.leadSource]),
        warmth,
        linkedinUrl:         str(row[COL.linkedinUrl]),
        teaorCode:           teaor.code,
        teaorDescription:    teaor.description,
        industryEn:          str(row[COL.industryEn]),
        scopeOfActivity:     str(row[COL.scopeOfActivity]),
        ndtMethods,
        productAreas,
        materials,
        products,
        isPedCompliant:      str(row[COL.isPed]) === 'YES' ? true : str(row[COL.isPed]) === 'NO' ? false : null,
        inspectionFrequency: str(row[COL.inspectionFreq]),
        hasInternalLab:      parseLabType(row[COL.labType]),
        competitor1:         str(row[COL.competitor1]),
        competitor2:         str(row[COL.competitor2]),
        competitor3:         str(row[COL.competitor3]),
        siteZip:             str(row[COL.siteZip]),
        siteCity:            str(row[COL.siteCity]),
        siteStreet:          str(row[COL.siteStreet]),
        siteCounty:          str(row[COL.siteCounty]),
        siteCountry:         str(row[COL.siteCountry]),
        revenue2019:         bigint(row[COL.revenue2019]),
        revenue2020:         bigint(row[COL.revenue2020]),
        revenue2021:         bigint(row[COL.revenue2021]),
        revenue2022:         bigint(row[COL.revenue2022]),
        revenue2023:         bigint(row[COL.revenue2023]),
        revenue2024:         bigint(row[COL.revenue2024]),
        customerValue:       bigint(row[COL.customerValue]),
      },
    });
    updated++;
    if ((i + 1) % 100 === 0) process.stdout.write(`\r  [enrich-companies] ${i + 1}/${dataRows.length}`);
  }

  console.log(`\n  [enrich-companies] updated=${updated} not_found=${notFound}`);
  return updated;
}
