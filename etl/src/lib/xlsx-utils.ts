import * as XLSX from 'xlsx';
import * as path from 'path';

export const DATA_DIR = path.join(__dirname, '../../data/source');

export function readSheet(filename: string, sheetName: string): Record<string, unknown>[] {
  const wb = XLSX.readFile(path.join(DATA_DIR, filename));
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in ${filename}`);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
}

// Excel date serial → JS Date (UTC)
export function excelDateToJs(serial: unknown): Date | null {
  if (serial === null || serial === undefined) return null;
  const n = Number(serial);
  if (isNaN(n) || n < 1) return null;
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

// YYYYMMDD integer → Date
export function yyyymmddToDate(n: unknown): Date | null {
  if (!n) return null;
  const s = String(Math.round(Number(n)));
  if (s.length !== 8) return null;
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
}

// "4 - HÍVTUK, NEM KELL" → "4"
export function parsePipelineStatus(raw: unknown): string | null {
  if (!raw) return null;
  const m = String(raw).match(/^(\d)/);
  return m ? m[1] : null;
}

export function mapStatus(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw);
  if (s === 'active') return 'active';
  if (s === 'F.A.') return 'fa';
  return 'inactive';
}

export function mapInteractionType(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).toUpperCase();
  if (s === 'E-MAIL' || s === 'EMAIL') return 'email';
  if (s === 'TELEFON') return 'call';
  if (s === 'MEETING' || s.includes('MEGBESZÉL')) return 'meeting';
  return 'note';
}

export function mapProposalResult(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw);
  if (s.includes('Won') || s.includes('CW')) return 'closed_won';
  if (s.includes('Lost') || s.includes('CL')) return 'closed_lost';
  if (s.includes('Proposal') || s.includes('offer')) return 'proposal';
  if (s.includes('Pending') || s.includes('PENDING')) return 'pending';
  return null;
}

export function normalizeCompanyName(name: string): string {
  return name.toUpperCase().trim().replace(/\s*F\.A\.\s*$/, '').trim();
}
