import { normalizeName } from "./normalize";

export type ImportEntity = "company" | "person";

export interface ImportField {
  key: string;
  label: string; // Hungarian UI label
  synonyms: string[]; // header variants we auto-detect (matched accent/case-insensitively)
  required?: boolean;
  hint?: string;
}

// Company columns we let the user map. `name` is the only hard requirement;
// everything else is optional and only written when present.
export const COMPANY_FIELDS: ImportField[] = [
  { key: "name", label: "Cégnév", required: true, synonyms: ["cégnév", "cegnev", "név", "name", "company", "company name", "ügyfél", "partner", "vállalat"] },
  { key: "vatNumber", label: "Adószám", synonyms: ["adószám", "adoszam", "vat", "tax number", "tax id", "vat number"], hint: "erős egyezési kulcs" },
  { key: "shortCode", label: "Rövid kód", synonyms: ["rövid kód", "kód", "short code", "code"] },
  { key: "status", label: "Státusz", synonyms: ["státusz", "status", "állapot"] },
  { key: "accountType", label: "Ügyféltípus", synonyms: ["típus", "account type", "kategória", "type"] },
  { key: "city", label: "Város", synonyms: ["város", "city", "település", "helység"] },
  { key: "county", label: "Megye", synonyms: ["megye", "county"] },
  { key: "zipCode", label: "Irányítószám", synonyms: ["irányítószám", "irsz", "zip", "postal", "postal code", "iranyitoszam"] },
  { key: "address", label: "Cím", synonyms: ["cím", "address", "utca", "street"] },
  { key: "country", label: "Ország", synonyms: ["ország", "country", "orszag"] },
  { key: "website", label: "Weboldal", synonyms: ["weboldal", "honlap", "website", "web", "url", "domain"] },
  { key: "teaorCode", label: "TEÁOR kód", synonyms: ["teáor kód", "teaor", "teáor", "teaor kod"] },
  { key: "teaorDescription", label: "TEÁOR leírás", synonyms: ["teáor leírás", "tevékenység", "tevekenyseg", "activity"] },
  { key: "industryCode", label: "Iparág (TEÁOR betű)", synonyms: ["iparág", "industry", "industry code", "szektor", "sector"] },
  { key: "warmth", label: "Hőfok", synonyms: ["hőfok", "warmth", "hofok"] },
  { key: "linkedinUrl", label: "LinkedIn", synonyms: ["linkedin", "linkedin url"] },
  { key: "notes", label: "Megjegyzés", synonyms: ["megjegyzés", "notes", "comment", "leírás", "megjegyzes"] },
];

// Person columns. A person is linked to a company via `companyName` or
// `companyVat`; work email/phone/role become the Contact at that company.
export const PERSON_FIELDS: ImportField[] = [
  { key: "lastName", label: "Vezetéknév", synonyms: ["vezetéknév", "last name", "családnév", "vezeteknev", "surname"] },
  { key: "firstName", label: "Keresztnév", synonyms: ["keresztnév", "first name", "utónév", "keresztnev", "given name"] },
  { key: "fullName", label: "Teljes név", required: true, synonyms: ["név", "name", "teljes név", "kapcsolattartó", "contact", "kapcsolattarto", "full name"], hint: "ha nincs külön vezeték/keresztnév" },
  { key: "companyName", label: "Cég (név szerint)", synonyms: ["cégnév", "cég", "company", "munkahely", "cegnev"], hint: "ehhez a céghez kötjük" },
  { key: "companyVat", label: "Cég adószáma", synonyms: ["cég adószám", "adószám", "vat", "company vat", "adoszam"] },
  { key: "email", label: "E-mail", synonyms: ["email", "e-mail", "mail", "e mail"] },
  { key: "phone", label: "Telefon", synonyms: ["telefon", "phone", "mobil", "tel", "telefonszám"] },
  { key: "role", label: "Beosztás", synonyms: ["beosztás", "pozíció", "role", "title", "munkakör", "beosztas"] },
];

export function fieldsFor(entity: ImportEntity): ImportField[] {
  return entity === "company" ? COMPANY_FIELDS : PERSON_FIELDS;
}

/**
 * Auto-guess a column→field mapping for detected file headers. Matches a header
 * against each field's synonyms (accent/case-insensitive; exact first, then
 * substring). Each field is assigned at most once (first matching column wins),
 * so two columns never collide on the same target.
 * Returns a record keyed by column name → field key (or "" for unmapped).
 */
export function guessMapping(
  columns: string[],
  entity: ImportEntity,
): Record<string, string> {
  const fields = fieldsFor(entity);
  const used = new Set<string>();
  const mapping: Record<string, string> = {};

  // Pre-normalize synonyms once.
  const normFields = fields.map((f) => ({
    key: f.key,
    syns: f.synonyms.map(normalizeName),
  }));

  // Pass 1: exact synonym match. Pass 2: substring. Two passes so an exact hit
  // is never stolen by a looser substring match on another column.
  for (const pass of [1, 2] as const) {
    for (const col of columns) {
      if (mapping[col]) continue;
      const h = normalizeName(col);
      if (!h) {
        mapping[col] = "";
        continue;
      }
      for (const f of normFields) {
        if (used.has(f.key)) continue;
        const hit =
          pass === 1
            ? f.syns.includes(h)
            : f.syns.some((s) => h === s || h.includes(s) || s.includes(h));
        if (hit) {
          mapping[col] = f.key;
          used.add(f.key);
          break;
        }
      }
    }
  }

  for (const col of columns) if (!(col in mapping)) mapping[col] = "";
  return mapping;
}
