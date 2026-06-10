import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { normalizeName, stripLegalSuffix, normalizeVat } from "./normalize";
import {
  buildCompanyRecord,
  buildPersonRecord,
  mapRowValues,
  type Mapping,
  type RawRow,
} from "./build";
import type { ImportEntity } from "./fields";
import type { ImportResult } from "./types";

const SAMPLE_LIMIT = 25;

function emptyResult(entity: ImportEntity, dryRun: boolean): ImportResult {
  return {
    entity, dryRun, total: 0, created: 0, matched: 0, skipped: 0,
    errors: [], companiesCreated: 0, contactsCreated: 0, sample: [],
  };
}

/** A company-matching index built once from the tenant's existing companies. */
async function loadCompanyIndex(tenantId: number) {
  const companies = await db.company.findMany({
    where: { tenantId },
    select: { id: true, name: true, vatNumber: true },
  });
  const byVat = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const c of companies) {
    const vat = normalizeVat(c.vatNumber);
    if (vat) byVat.set(vat, c.id);
    const key = stripLegalSuffix(normalizeName(c.name));
    if (key && !byName.has(key)) byName.set(key, c.id);
  }
  return { byVat, byName };
}

function matchCompany(
  idx: { byVat: Map<string, number>; byName: Map<string, number> },
  vat: string | null,
  name: string,
): number | undefined {
  if (vat) {
    const hit = idx.byVat.get(vat);
    if (hit) return hit;
  }
  return idx.byName.get(stripLegalSuffix(normalizeName(name)));
}

export async function runCompanyImport(
  rows: RawRow[],
  mapping: Mapping,
  opts: { dryRun: boolean; tenantId: number },
): Promise<ImportResult> {
  const res = emptyResult("company", opts.dryRun);
  res.total = rows.length;
  const idx = await loadCompanyIndex(opts.tenantId);

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const built = buildCompanyRecord(mapRowValues(rows[i], mapping));
    if (!built.ok) {
      res.skipped++;
      res.errors.push({ row: rowNum, message: built.error });
      pushSample(res, rowNum, "hiba", `${rowNum}. sor`, built.error);
      continue;
    }
    const r = built.record;
    if (built.skip) {
      res.skipped++;
      pushSample(res, rowNum, "kihagyva", r.name, built.skip.reason);
      continue;
    }

    const existing = matchCompany(idx, r.vatNumber, r.name);
    if (existing) {
      res.matched++;
      pushSample(res, rowNum, "meglévő", r.name, "már létezik — kihagyva");
      continue;
    }

    if (!opts.dryRun) {
      const created = await db.company.create({
        data: {
          tenantId: opts.tenantId,
          name: r.name,
          vatNumber: r.vatNumber, shortCode: r.shortCode, status: r.status,
          accountType: r.accountType, city: r.city, county: r.county,
          zipCode: r.zipCode, address: r.address, country: r.country,
          website: r.website, teaorCode: r.teaorCode,
          teaorDescription: r.teaorDescription, industryCode: r.industryCode,
          warmth: r.warmth, linkedinUrl: r.linkedinUrl, notes: r.notes,
        },
        select: { id: true },
      });
      await audit("company", created.id, "create", null, { name: r.name, source: "import" }, { tenantId: opts.tenantId });
      // dedupe within this same file
      if (r.vatNumber) idx.byVat.set(r.vatNumber, created.id);
      const key = stripLegalSuffix(normalizeName(r.name));
      if (key && !idx.byName.has(key)) idx.byName.set(key, created.id);
    }
    res.created++;
    pushSample(res, rowNum, "új", r.name, opts.dryRun ? "új cég lesz" : "létrehozva");
  }
  return res;
}

export async function runPersonImport(
  rows: RawRow[],
  mapping: Mapping,
  opts: { dryRun: boolean; tenantId: number },
): Promise<ImportResult> {
  const res = emptyResult("person", opts.dryRun);
  res.total = rows.length;
  const idx = await loadCompanyIndex(opts.tenantId);

  // Person match index: normalized "lastName firstName".
  const persons = await db.person.findMany({
    where: { tenantId: opts.tenantId },
    select: { id: true, firstName: true, lastName: true },
  });
  const personByName = new Map<string, number>();
  for (const p of persons) {
    const key = normalizeName(`${p.lastName ?? ""} ${p.firstName ?? ""}`);
    if (key && !personByName.has(key)) personByName.set(key, p.id);
  }
  // Existing open contacts, to avoid duplicate person@company links.
  const openContacts = await db.contact.findMany({
    where: { tenantId: opts.tenantId, endedAt: null },
    select: { personId: true, companyId: true },
  });
  const contactSet = new Set(openContacts.map((c) => `${c.personId}:${c.companyId}`));

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const built = buildPersonRecord(mapRowValues(rows[i], mapping));
    if (!built.ok) {
      res.skipped++;
      res.errors.push({ row: rowNum, message: built.error });
      pushSample(res, rowNum, "hiba", `${rowNum}. sor`, built.error);
      continue;
    }
    const r = built.record;
    const label = `${r.lastName ?? ""} ${r.firstName ?? ""}`.trim();

    // Resolve (or create) the company this person belongs to.
    let companyId: number | undefined;
    if (r.companyVat || r.companyName) {
      companyId = matchCompany(idx, r.companyVat, r.companyName ?? "");
      if (!companyId && r.companyName && !opts.dryRun) {
        const c = await db.company.create({
          data: { tenantId: opts.tenantId, name: r.companyName, vatNumber: r.companyVat, status: "active" },
          select: { id: true },
        });
        await audit("company", c.id, "create", null, { name: r.companyName, source: "import" }, { tenantId: opts.tenantId });
        companyId = c.id;
        if (r.companyVat) idx.byVat.set(r.companyVat, c.id);
        const key = stripLegalSuffix(normalizeName(r.companyName));
        if (key && !idx.byName.has(key)) idx.byName.set(key, c.id);
        res.companiesCreated++;
      } else if (!companyId && r.companyName && opts.dryRun) {
        res.companiesCreated++;
      }
    }

    // Resolve (or create) the person.
    const nameKey = normalizeName(`${r.lastName ?? ""} ${r.firstName ?? ""}`);
    let personId = personByName.get(nameKey);
    const personExisted = personId != null;
    if (!personId) {
      if (!opts.dryRun) {
        const p = await db.person.create({
          data: { tenantId: opts.tenantId, firstName: r.firstName ?? "", lastName: r.lastName ?? "" },
          select: { id: true },
        });
        await audit("person", p.id, "create", null, { name: label, source: "import" }, { tenantId: opts.tenantId });
        personId = p.id;
        if (nameKey) personByName.set(nameKey, p.id);
      }
      res.created++;
    } else {
      res.matched++;
    }

    // Link person ↔ company via a Contact if one doesn't already exist.
    if (companyId && personId && !contactSet.has(`${personId}:${companyId}`)) {
      if (!opts.dryRun) {
        const contact = await db.contact.create({
          data: {
            tenantId: opts.tenantId, personId, companyId,
            email: r.email, phone: r.phone, role: r.role,
          },
          select: { id: true },
        });
        await audit("contact", contact.id, "create", null, { personId, companyId, source: "import" }, { tenantId: opts.tenantId });
      }
      contactSet.add(`${personId}:${companyId}`);
      res.contactsCreated++;
    }

    const detail = personExisted ? "meglévő személy" : opts.dryRun ? "új személy lesz" : "létrehozva";
    pushSample(res, rowNum, personExisted ? "meglévő" : "új", label || `${rowNum}. sor`, detail);
  }
  return res;
}

function pushSample(res: ImportResult, row: number, status: ImportResult["sample"][number]["status"], label: string, detail?: string) {
  if (res.sample.length < SAMPLE_LIMIT) res.sample.push({ row, status, label, detail });
}

export function runImport(
  entity: ImportEntity,
  rows: RawRow[],
  mapping: Mapping,
  opts: { dryRun: boolean; tenantId: number },
): Promise<ImportResult> {
  return entity === "company"
    ? runCompanyImport(rows, mapping, opts)
    : runPersonImport(rows, mapping, opts);
}
