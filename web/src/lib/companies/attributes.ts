// Feature E: the company metadata attributes that are EFFECTIVE-DATED (history
// kept, never overwritten). Source of truth = the company_attributes table; the
// scalar column(s) named here stay as the denormalized PRIMARY-current value for
// fast filtering and are written in the same transaction. Pure config + helpers
// (no db) so this file is import-safe for client components and unit-testable.

export const COMPANY_ATTR_TYPES = [
  "industry",
  "teaor",
  "warmth",
  "account_type",
  "status",
] as const;
export type CompanyAttrType = (typeof COMPANY_ATTR_TYPES)[number];

export interface CompanyAttrTypeDef {
  type: CompanyAttrType;
  label: string;           // HU section label
  /** Can a company hold several CURRENT values at once (one flagged primary)? */
  multi: boolean;
  /** Company column that mirrors the PRIMARY-current value (denormalized). */
  primaryValueColumn: string;
  /** Optional Company column mirroring the primary value's label. */
  primaryLabelColumn?: string;
  /** Fixed options, if this attr is an enum (else free text). */
  options?: { value: string; label: string }[];
}

export const COMPANY_ATTR_DEFS: Record<CompanyAttrType, CompanyAttrTypeDef> = {
  industry: {
    type: "industry", label: "Iparág", multi: false,
    primaryValueColumn: "industryCode", primaryLabelColumn: "industryEn",
  },
  teaor: {
    type: "teaor", label: "TEÁOR", multi: true,
    primaryValueColumn: "teaorCode", primaryLabelColumn: "teaorDescription",
  },
  warmth: {
    type: "warmth", label: "Hőfok (warmth)", multi: false,
    primaryValueColumn: "warmth",
    options: [
      { value: "cold", label: "Hideg" },
      { value: "warm", label: "Langyos" },
      { value: "hot", label: "Forró" },
    ],
  },
  account_type: {
    type: "account_type", label: "Partner kategória", multi: false,
    primaryValueColumn: "accountType",
    options: [
      { value: "Prospect", label: "Prospect" },
      { value: "Customer", label: "Ügyfél" },
      { value: "Vendor", label: "Szállító" },
    ],
  },
  status: {
    type: "status", label: "Státusz", multi: false,
    primaryValueColumn: "status",
    options: [
      { value: "active", label: "Aktív" },
      { value: "inactive", label: "Inaktív" },
      { value: "fa", label: "Felszámolás alatt" },
    ],
  },
};

export function isCompanyAttrType(v: string): v is CompanyAttrType {
  return (COMPANY_ATTR_TYPES as readonly string[]).includes(v);
}

/** Human label for an attribute value (uses fixed options when present). */
export function attrValueLabel(type: CompanyAttrType, value: string, label?: string | null): string {
  const def = COMPANY_ATTR_DEFS[type];
  const opt = def.options?.find((o) => o.value === value);
  if (opt) return opt.label;
  return label?.trim() || value;
}

export interface AttrRow {
  id: number;
  attrType: string;
  value: string;
  label: string | null;
  isPrimary: boolean;
  validFrom: string | Date;
  validTo: string | Date | null;
  source: string | null;
}

/** Split a flat attribute list into { current[], history[] } for one attrType. */
export function partitionAttrs(rows: AttrRow[], type: CompanyAttrType): {
  current: AttrRow[];
  history: AttrRow[];
} {
  const ofType = rows.filter((r) => r.attrType === type);
  const current = ofType
    .filter((r) => r.validTo === null)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)); // primary first
  const history = ofType
    .filter((r) => r.validTo !== null)
    .sort((a, b) => new Date(b.validTo as string).getTime() - new Date(a.validTo as string).getTime());
  return { current, history };
}
