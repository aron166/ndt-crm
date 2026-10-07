import {
  normalizeAccountType,
  normalizeCompanyStatus,
  normalizeWarmth,
} from '../../../web/src/lib/import/normalize';

type Raw = { status?: unknown; accountType?: unknown; warmth?: unknown };

const blank = (v: unknown) => v == null || String(v).trim() === '';

/** Canonical company enums for any ETL write. Unknown account type/warmth -> null + warn, never the raw label. */
export function canonicalCompanyEnums(raw: Raw, rowId?: string | number) {
  const warn = (field: string, v: unknown) =>
    console.warn(`  [enums] unknown ${field} ${JSON.stringify(v)} (row ${rowId ?? '?'}) -> null`);

  let status: string | null = null;
  if (!blank(raw.status)) {
    const st = normalizeCompanyStatus(String(raw.status));
    // Unknown status is stored active (importer rule); the old etl mapper said inactive. Warn so it is visible.
    if (st.unknown) warn('status', raw.status);
    status = st.status;
  }
  let accountType: string | null = null;
  if (!blank(raw.accountType)) {
    accountType = normalizeAccountType(String(raw.accountType)) ?? null;
    if (accountType === null) warn('account_type', raw.accountType);
  }
  let warmth: string | null = null;
  if (!blank(raw.warmth)) {
    warmth = normalizeWarmth(String(raw.warmth)) ?? null;
    if (warmth === null) warn('warmth', raw.warmth);
  }
  return { status, accountType, warmth };
}
