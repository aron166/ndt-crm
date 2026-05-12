/**
 * Import persons + contacts from Google Contacts xlsx export.
 * Matches each person's company to the existing companies table by name.
 * Usage: ts-node src/migrate-contacts.ts [--dry-run] [--reset]
 */

import * as XLSX from "xlsx";
import * as path from "path";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const db = new PrismaClient();
const TENANT_ID = 1;
const SHEET_NAME = "contacts (7)";

const isDryRun = process.argv.includes("--dry-run");
const isReset = process.argv.includes("--reset");

// ── Column indices (0-based) from the xlsx header row ──
const COL = {
  firstName: 1,       // Given Name
  lastName: 3,        // Family Name
  notes: 12,          // Notes
  email1: 17,         // E-mail 1 - Value
  phone1: 23,         // Phone1-Value
  phone2: 25,         // Phone2-Value
  orgName: 59,        // Organization 1 - Name
  orgTitle: 61,       // Organization 1 - Title
  ceg: 10,            // CÉG (fallback for company name)
};

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    // remove legal suffixes to improve matching across different formats
    .replace(/\b(kft|bt|zrt|rt|nyrt|kkt|kv|fióktelepe|kizárólagos képviselet)\b\.?/gi, "")
    // strip punctuation + extra spaces
    .replace(/[.\-,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  console.log(`\nNDT CRM — Contacts Import`);
  console.log(`  dry-run : ${isDryRun}`);
  console.log(`  reset   : ${isReset}\n`);

  if (isReset && !isDryRun) {
    console.log("--reset: deleting existing persons + contacts for tenant 1...");
    await db.contact.deleteMany({ where: { tenantId: TENANT_ID } });
    await db.person.deleteMany({ where: { tenantId: TENANT_ID } });
    console.log("  done.\n");
  }

  // Load xlsx
  const filePath = path.join(__dirname, "../data/20230125_contacts.xlsx");
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`Sheet "${SHEET_NAME}" not found`);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const dataRows = rows.slice(1).filter((row) => {
    const arr = row as unknown[];
    return clean(arr[COL.firstName]) || clean(arr[COL.lastName]);
  });

  console.log(`  ${dataRows.length} contact rows to process`);

  // Build company lookup map: normalizedName → id
  const companies = await db.company.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true },
  });
  const companyMap = new Map<string, number>();
  for (const c of companies) {
    companyMap.set(normalizeCompanyName(c.name), c.id);
  }
  console.log(`  ${companyMap.size} companies loaded for matching\n`);

  let personsCreated = 0;
  let personsSkipped = 0;
  let contactsLinked = 0;
  let companiesNotFound = 0;
  const unmatchedCompanies = new Set<string>();

  for (const rawRow of dataRows) {
    const row = rawRow as unknown[];

    const firstName = clean(row[COL.firstName]);
    const lastName = clean(row[COL.lastName]);
    const email = clean(row[COL.email1]) || null;
    const phone = clean(row[COL.phone1]) || clean(row[COL.phone2]) || null;
    const notes = clean(row[COL.notes]) || null;
    const companyName = clean(row[COL.orgName]) || clean(row[COL.ceg]) || null;
    const role = clean(row[COL.orgTitle]) || null;

    if (!firstName && !lastName) continue;

    // Find or create person — dedup on email if present
    let personId: number | null = null;

    if (!isDryRun) {
      let person = email
        ? await db.person.findFirst({
            where: { tenantId: TENANT_ID, email },
          })
        : null;

      if (person) {
        personsSkipped++;
        personId = person.id;
      } else {
        person = await db.person.create({
          data: {
            tenantId: TENANT_ID,
            firstName: firstName || lastName || "?",
            lastName: lastName || firstName || "?",
            email: email ?? undefined,
            phone: phone ?? undefined,
            notes: notes ?? undefined,
          },
        });
        personsCreated++;
        personId = person.id;
      }

      // Link to company if we can find a match
      if (personId && companyName) {
        const normalized = normalizeCompanyName(companyName);
        const companyId = companyMap.get(normalized);

        if (companyId) {
          // Avoid duplicate contacts
          const existing = await db.contact.findFirst({
            where: { tenantId: TENANT_ID, personId, companyId },
          });
          if (!existing) {
            await db.contact.create({
              data: {
                tenantId: TENANT_ID,
                personId,
                companyId,
                role,
                isPrimary: true,
              },
            });
            contactsLinked++;
          }
        } else {
          companiesNotFound++;
          unmatchedCompanies.add(companyName);
        }
      }
    } else {
      // dry run — just count
      personsCreated++;
      if (companyName) {
        const normalized = normalizeCompanyName(companyName);
        if (companyMap.has(normalized)) {
          contactsLinked++;
        } else {
          companiesNotFound++;
          unmatchedCompanies.add(companyName);
        }
      }
    }
  }

  console.log(`Results:`);
  console.log(`  persons created  : ${personsCreated}`);
  console.log(`  persons skipped  : ${personsSkipped} (email already existed)`);
  console.log(`  contacts linked  : ${contactsLinked}`);
  console.log(`  companies not found: ${companiesNotFound}`);

  if (unmatchedCompanies.size > 0) {
    console.log(`\n  First 20 unmatched company names:`);
    [...unmatchedCompanies].slice(0, 20).forEach((n) => console.log(`    - ${n}`));
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
