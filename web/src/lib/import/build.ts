import {
  normalizeVat,
  normalizeWebsite,
  normalizeCompanyStatus,
  normalizeAccountType,
  normalizeWarmth,
  splitFullName,
} from "./normalize";

export type RawRow = Record<string, unknown>;
/** column name → field key (or "" when the column is ignored). */
export type Mapping = Record<string, string>;

/** Invert a column→field mapping into field→trimmed-string for one raw row. */
export function mapRowValues(row: RawRow, mapping: Mapping): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [col, field] of Object.entries(mapping)) {
    if (!field) continue;
    const raw = row[col];
    if (raw == null) continue;
    const val = String(raw).trim();
    if (val) out[field] = val;
  }
  return out;
}

export interface CompanyRecord {
  name: string;
  vatNumber: string | null;
  shortCode: string | null;
  status: string;
  accountType: string | null;
  city: string | null;
  county: string | null;
  zipCode: string | null;
  address: string | null;
  country: string | null;
  website: string | null;
  teaorCode: string | null;
  teaorDescription: string | null;
  industryCode: string | null;
  warmth: string | null;
  linkedinUrl: string | null;
  notes: string | null;
}

export interface PersonRecord {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  companyVat: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
}

export type BuildResult<T> =
  | { ok: true; record: T; skip?: { reason: string }; warnings?: string[] }
  | { ok: false; error: string };

const orNull = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function buildCompanyRecord(values: Record<string, string>): BuildResult<CompanyRecord> {
  const name = orNull(values.name);
  if (!name) return { ok: false, error: "Hiányzó cégnév" };

  const { status, dissolved, unknown } = normalizeCompanyStatus(values.status);
  // Unknown enum values never drop the row: stored blank (status: active) and reported as a warning.
  const warnings: string[] = [];
  if (unknown) warnings.push(`ismeretlen státusz (aktív lesz): ${values.status}`);
  const accountType = normalizeAccountType(values.accountType) ?? null;
  if (values.accountType?.trim() && !accountType) warnings.push(`ismeretlen partner kategória (üres marad): ${values.accountType}`);
  const warmth = normalizeWarmth(values.warmth) ?? null;
  if (values.warmth?.trim() && !warmth) warnings.push(`ismeretlen hőfok (üres marad): ${values.warmth}`);

  const record: CompanyRecord = {
    name,
    vatNumber: normalizeVat(values.vatNumber),
    shortCode: orNull(values.shortCode),
    status,
    accountType,
    city: orNull(values.city),
    county: orNull(values.county),
    zipCode: orNull(values.zipCode),
    address: orNull(values.address),
    country: orNull(values.country),
    website: normalizeWebsite(values.website),
    teaorCode: orNull(values.teaorCode),
    teaorDescription: orNull(values.teaorDescription),
    industryCode: orNull(values.industryCode),
    warmth,
    linkedinUrl: orNull(values.linkedinUrl),
    notes: orNull(values.notes),
  };

  // Dissolved companies are imported-but-flagged: caller decides to skip them
  // (decisions ethos — don't seed dead companies into the attack list).
  const w = warnings.length ? { warnings } : {};
  return dissolved ? { ok: true, record, skip: { reason: "Felszámolt / megszűnt cég" }, ...w } : { ok: true, record, ...w };
}

export function buildPersonRecord(values: Record<string, string>): BuildResult<PersonRecord> {
  let firstName = orNull(values.firstName);
  let lastName = orNull(values.lastName);

  if (!firstName && !lastName && values.fullName) {
    const split = splitFullName(values.fullName);
    firstName = split.firstName;
    lastName = split.lastName;
  }

  if (!firstName && !lastName) return { ok: false, error: "Hiányzó név" };

  const record: PersonRecord = {
    firstName,
    lastName,
    companyName: orNull(values.companyName),
    companyVat: normalizeVat(values.companyVat) ?? orNull(values.companyVat),
    email: orNull(values.email),
    phone: orNull(values.phone),
    role: orNull(values.role),
  };
  return { ok: true, record };
}
