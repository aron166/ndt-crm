import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const dataDir = path.join(__dirname, '../data/source');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.xlsx'));

for (const file of files) {
  const wb = XLSX.readFile(path.join(dataDir, file));
  console.log(`\n${'='.repeat(60)}`);
  console.log(`FILE: ${file}`);
  console.log(`Sheets: ${wb.SheetNames.join(', ')}`);

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    if (rows.length === 0) { console.log(`  [${sheetName}] empty`); continue; }

    const cols = Object.keys(rows[0]);
    console.log(`\n  Sheet: "${sheetName}" — ${rows.length} rows`);
    console.log(`  Columns (${cols.length}): ${cols.join(' | ')}`);
    console.log(`  Sample row 1: ${JSON.stringify(rows[0])}`);
    if (rows.length > 1) console.log(`  Sample row 2: ${JSON.stringify(rows[1])}`);
  }
}
