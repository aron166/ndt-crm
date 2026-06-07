"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import Groq from "groq-sdk";

const TENANT_ID = 1;
const GROQ_MODEL = "llama-3.3-70b-versatile";
const FETCH_TIMEOUT_MS = 8000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldChange {
  current: string | null;
  proposed: string;
  source: string;       // which source produced this: "nav_api" | "registry" | "website_ping" | "ai_synthesis"
  confidence: number;
  status: "pending" | "approved" | "rejected";
}

export type ChangesMap = Record<string, FieldChange>;

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Source 1: NAV (Hungarian tax authority) API ──────────────────────────────
// Returns official company name, address, and VAT validity — no AI, 100% structured.

interface NavResult {
  officialName: string | null;
  address: string | null;
  vatValid: boolean;
}

async function checkNavApi(vatNumber: string): Promise<NavResult | null> {
  try {
    // Strip to 8-digit core (Hungarian VAT format: 12345678-9-01)
    const taxNumber = vatNumber.replace(/-/g, "").slice(0, 8);

    const res = await fetchWithTimeout(
      `https://api.nav.gov.hu/api/public/v1/queryTaxpayer?taxNumber=${taxNumber}`,
      { headers: { Accept: "application/json" } },
    );

    if (!res.ok) return null;
    const data = await res.json() as {
      taxpayerData?: {
        taxpayerName?: string;
        taxpayerAddressList?: { taxpayerAddress?: { postalCode?: string; city?: string; streetName?: string } }[];
      };
      validity?: boolean;
    };

    const addr = data.taxpayerData?.taxpayerAddressList?.[0]?.taxpayerAddress;
    const addressStr = addr
      ? [addr.postalCode, addr.city, addr.streetName].filter(Boolean).join(" ")
      : null;

    return {
      officialName: data.taxpayerData?.taxpayerName ?? null,
      address: addressStr,
      vatValid: data.validity !== false,
    };
  } catch {
    return null;
  }
}

// ─── Source 2: Hungarian company registry ─────────────────────────────────────
// Checks dissolution/F.A. status from the official cég registry.

interface RegistryResult {
  found: boolean;
  dissolved: boolean;
  liquidation: boolean;
}

async function checkRegistry(vatNumber: string): Promise<RegistryResult | null> {
  try {
    const vatCore = vatNumber.replace(/-/g, "").slice(0, 8);
    const res = await fetchWithTimeout(
      `https://e-cegjegyzek.im.gov.hu/cegkereses/cegkivonat.html?cegid=${vatCore}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; NDT-CRM/1.0)" } },
    );
    if (!res.ok) return null;

    const html = (await res.text()).toLowerCase();
    return {
      found: !html.includes("nem található") && !html.includes("not found"),
      dissolved: html.includes("törölt") || html.includes("megszűnt"),
      liquidation: html.includes("felszámolás") || html.includes("f.a."),
    };
  } catch {
    return null;
  }
}

// ─── Source 3: Website liveness ping ─────────────────────────────────────────
// Simple HEAD request — is the website still up?

async function pingWebsite(url: string): Promise<"alive" | "dead" | "unknown"> {
  if (!url) return "unknown";
  try {
    const normalised = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetchWithTimeout(normalised, { method: "HEAD" });
    return res.ok || res.status < 400 ? "alive" : "dead";
  } catch {
    return "dead";
  }
}

// ─── Source 4: AI synthesis (Groq) ────────────────────────────────────────────
// Only called after structured sources have run. Receives ALL collected facts.
// Fills in ONLY what structured sources couldn't answer.

function getGroq(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  return new Groq({ apiKey });
}

interface AiCompanyResult {
  website?: string | null;
  sector?: string | null;
  notes?: string | null;
  confidence: Partial<Record<"website" | "sector" | "notes", number>>;
}

async function aiSynthesiseCompany(
  company: { name: string; vatNumber: string | null; city: string | null; website: string | null; status: string | null },
  facts: string,
  missingFields: string[],
): Promise<AiCompanyResult> {
  if (missingFields.length === 0) return { confidence: {} };

  const groq = getGroq();
  const fieldsNeeded = missingFields.join(", ");

  const systemPrompt = `You are a business intelligence assistant. You receive structured, verified facts about a Hungarian company and must fill only the requested missing fields.
Return ONLY valid JSON — no markdown, no prose:
{
  ${missingFields.includes("website") ? '"website": string | null,' : ""}
  ${missingFields.includes("sector") ? '"sector": string | null,' : ""}
  ${missingFields.includes("notes") ? '"notes": string | null,' : ""}
  "confidence": { ${missingFields.map(f => `"${f}": 0.0`).join(", ")} }
}
Be conservative — return null rather than guessing. Confidence reflects how sure you are.`;

  const userPrompt = `Company: ${company.name}
City: ${company.city ?? "unknown"}, Hungary
VAT: ${company.vatNumber ?? "unknown"}

Verified facts already collected:
${facts}

Please fill these missing fields: ${fieldsNeeded}`;

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 300,
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const jsonStr = raw.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
  return JSON.parse(jsonStr) as AiCompanyResult;
}

// ─── Company enrichment pipeline ──────────────────────────────────────────────

async function buildCompanyChanges(company: {
  id: number;
  name: string;
  vatNumber: string | null;
  city: string | null;
  website: string | null;
  status: string | null;
  address: string | null;
  country: string | null;
}): Promise<{ changes: ChangesMap; rawResponse: string }> {
  const changes: ChangesMap = {};
  const factLines: string[] = [];
  const missingFields: string[] = [];

  // ── Source 1: NAV API ──
  let nav: NavResult | null = null;
  if (company.vatNumber) {
    nav = await checkNavApi(company.vatNumber);
    if (nav) {
      factLines.push(`NAV API: company found, VAT valid=${nav.vatValid}, official name="${nav.officialName}", address="${nav.address}"`);

      if (nav.officialName && nav.officialName !== company.name) {
        changes["name"] = { current: company.name, proposed: nav.officialName, source: "nav_api", confidence: 0.95, status: "pending" };
      }
      if (nav.address && nav.address !== company.address) {
        changes["address"] = { current: company.address ?? null, proposed: nav.address, source: "nav_api", confidence: 0.95, status: "pending" };
      }
      if (!nav.vatValid) {
        changes["status"] = { current: company.status ?? null, proposed: "inactive", source: "nav_api", confidence: 0.9, status: "pending" };
      }
    } else {
      factLines.push("NAV API: unavailable or timeout");
    }
  }

  // ── Source 2: Company registry ──
  let registry: RegistryResult | null = null;
  if (company.vatNumber) {
    registry = await checkRegistry(company.vatNumber);
    if (registry) {
      factLines.push(`Registry: found=${registry.found}, dissolved=${registry.dissolved}, liquidation=${registry.liquidation}`);

      if (registry.liquidation && company.status !== "F.A.") {
        changes["status"] = { current: company.status ?? null, proposed: "F.A.", source: "registry", confidence: 0.92, status: "pending" };
      } else if (registry.dissolved && company.status !== "inactive") {
        changes["status"] = { current: company.status ?? null, proposed: "inactive", source: "registry", confidence: 0.9, status: "pending" };
      } else if (registry.found && !registry.dissolved && !registry.liquidation && company.status === "inactive") {
        changes["status"] = { current: company.status, proposed: "active", source: "registry", confidence: 0.85, status: "pending" };
      }
    } else {
      factLines.push("Registry: unavailable or timeout");
    }
  }

  // ── Source 3: Website ping ──
  if (company.website) {
    const ping = await pingWebsite(company.website);
    factLines.push(`Website ping (${company.website}): ${ping}`);
    if (ping === "dead") {
      changes["website"] = { current: company.website, proposed: "", source: "website_ping", confidence: 0.8, status: "pending" };
    }
  }

  // ── Decide what still needs AI ──
  if (!changes["website"] && !company.website) missingFields.push("website");
  if (!changes["status"]) missingFields.push("sector"); // sector is always AI — no structured source
  missingFields.push("notes");

  // ── Source 4: AI synthesis (only for gaps) ──
  let aiResult: AiCompanyResult = { confidence: {} };
  try {
    aiResult = await aiSynthesiseCompany(company, factLines.join("\n"), missingFields);

    if (aiResult.website && !company.website && (aiResult.confidence.website ?? 0) > 0.6) {
      changes["website"] = { current: null, proposed: aiResult.website, source: "ai_synthesis", confidence: aiResult.confidence.website ?? 0.6, status: "pending" };
    }
    if (aiResult.sector && (aiResult.confidence.sector ?? 0) > 0.5) {
      changes["industryCode"] = { current: null, proposed: aiResult.sector, source: "ai_synthesis", confidence: aiResult.confidence.sector ?? 0.5, status: "pending" };
    }
    if (aiResult.notes && (aiResult.confidence.notes ?? 0) > 0.5) {
      changes["notes"] = { current: null, proposed: `Enrichment: ${aiResult.notes}`, source: "ai_synthesis", confidence: aiResult.confidence.notes ?? 0.5, status: "pending" };
    }
  } catch (err) {
    factLines.push(`AI synthesis error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    changes,
    rawResponse: JSON.stringify({ facts: factLines, aiMissingFields: missingFields, proposed: Object.keys(changes) }),
  };
}

// ─── Person enrichment pipeline ───────────────────────────────────────────────
// Structured sources: email domain MX check, LinkedIn URL heuristic.
// AI: only if LinkedIn URL is missing.

async function checkEmailDomain(email: string): Promise<"valid_domain" | "invalid_domain" | "unknown"> {
  try {
    const domain = email.split("@")[1];
    if (!domain) return "unknown";
    const res = await fetchWithTimeout(`https://dns.google/resolve?name=${domain}&type=MX`);
    if (!res.ok) return "unknown";
    const data = await res.json() as { Answer?: unknown[] };
    return (data.Answer && data.Answer.length > 0) ? "valid_domain" : "invalid_domain";
  } catch {
    return "unknown";
  }
}

function buildLinkedinHeuristic(firstName: string, lastName: string): string {
  const slug = `${firstName}-${lastName}`.toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return `https://www.linkedin.com/in/${slug}`;
}

async function buildPersonChanges(person: {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  linkedinUrl: string | null;
  notes: string | null;
}, currentEmployer: { companyName: string; role: string | null } | null): Promise<{ changes: ChangesMap; rawResponse: string }> {
  const changes: ChangesMap = {};
  const factLines: string[] = [];

  // ── Source 1: Email domain MX check ──
  if (person.email) {
    const emailCheck = await checkEmailDomain(person.email);
    factLines.push(`Email domain check (${person.email}): ${emailCheck}`);
    if (emailCheck === "invalid_domain") {
      changes["notes"] = {
        current: person.notes ?? null,
        proposed: `${person.notes ? person.notes + "\n" : ""}Enrichment: email domain unreachable as of ${new Date().toISOString().slice(0, 10)}`,
        source: "email_check",
        confidence: 0.85,
        status: "pending",
      };
    }
  }

  // ── Source 2: LinkedIn URL heuristic ──
  if (!person.linkedinUrl) {
    const heuristic = buildLinkedinHeuristic(person.firstName, person.lastName);
    factLines.push(`LinkedIn heuristic: ${heuristic} (unverified)`);
    // Low confidence — just a suggestion
    changes["linkedinUrl"] = {
      current: null,
      proposed: heuristic,
      source: "heuristic",
      confidence: 0.35,
      status: "pending",
    };
  }

  // ── Source 3: AI (only for notes/context if employer known) ──
  if (currentEmployer) {
    try {
      const groq = getGroq();
      const systemPrompt = `You are a professional network assistant. Given a person's name and employer in Hungary's NDT inspection industry, provide ONLY a brief, factual context note if you have genuine knowledge — otherwise return null.
Return ONLY JSON: { "notes": string | null, "confidence": number }`;

      const userPrompt = `Person: ${person.firstName} ${person.lastName}
Employer: ${currentEmployer.companyName}, role: ${currentEmployer.role ?? "unknown"}
Industry: NDT inspection, Hungary

Do you have any verifiable public information about this person? If not, return null.`;

      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.1,
        max_tokens: 150,
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      const jsonStr = raw.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
      const parsed = JSON.parse(jsonStr) as { notes?: string | null; confidence?: number };

      if (parsed.notes && (parsed.confidence ?? 0) > 0.6 && !changes["notes"]) {
        changes["notes"] = {
          current: person.notes ?? null,
          proposed: `${person.notes ? person.notes + "\n" : ""}Enrichment: ${parsed.notes}`,
          source: "ai_synthesis",
          confidence: parsed.confidence ?? 0.6,
          status: "pending",
        };
      }
      factLines.push(`AI synthesis: returned notes=${!!parsed.notes}, confidence=${parsed.confidence}`);
    } catch (err) {
      factLines.push(`AI synthesis error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    changes,
    rawResponse: JSON.stringify({ facts: factLines, proposed: Object.keys(changes) }),
  };
}

// ─── Bulk trigger ─────────────────────────────────────────────────────────────

export async function triggerBulkEnrichment(
  entityType: "company" | "person",
  entityIds: number[],
): Promise<number> {
  const cappedIds = entityIds.slice(0, 20);

  const run = await db.enrichmentRun.create({
    data: { tenantId: TENANT_ID, entityType, entityIds: cappedIds, status: "running", startedAt: new Date() },
  });

  for (const entityId of cappedIds) {
    try {
      if (entityType === "company") {
        const company = await db.company.findFirst({
          where: { id: entityId, tenantId: TENANT_ID },
          select: { id: true, name: true, vatNumber: true, city: true, website: true, status: true, address: true, country: true },
        });
        if (!company) continue;

        const { changes, rawResponse } = await buildCompanyChanges(company);
        await db.enrichmentProposal.create({
          data: {
            tenantId: TENANT_ID, runId: run.id, entityType, entityId,
            entityName: company.name,
            changes: changes as unknown as object,
            overallStatus: Object.keys(changes).length > 0 ? "pending" : "rejected",
            rawResponse,
          },
        });
      } else {
        const person = await db.person.findFirst({
          where: { id: entityId, tenantId: TENANT_ID },
          select: { id: true, firstName: true, lastName: true, email: true, linkedinUrl: true, notes: true },
        });
        if (!person) continue;

        const activeContact = await db.contact.findFirst({
          where: { personId: entityId, tenantId: TENANT_ID, endedAt: null },
          include: { company: { select: { name: true } } },
        });
        const currentEmployer = activeContact
          ? { companyName: activeContact.company.name, role: activeContact.role }
          : null;

        const { changes, rawResponse } = await buildPersonChanges(person, currentEmployer);
        await db.enrichmentProposal.create({
          data: {
            tenantId: TENANT_ID, runId: run.id, entityType, entityId,
            entityName: `${person.firstName} ${person.lastName}`,
            changes: changes as unknown as object,
            overallStatus: Object.keys(changes).length > 0 ? "pending" : "rejected",
            rawResponse,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const fallbackName = entityType === "company"
        ? ((await db.company.findFirst({ where: { id: entityId }, select: { name: true } }))?.name ?? String(entityId))
        : String(entityId);
      await db.enrichmentProposal.create({
        data: {
          tenantId: TENANT_ID, runId: run.id, entityType, entityId,
          entityName: fallbackName,
          changes: {},
          overallStatus: "rejected",
          rawResponse: `ERROR: ${message}`,
        },
      });
    }
  }

  await db.enrichmentRun.update({
    where: { id: run.id },
    data: { status: "done", finishedAt: new Date() },
  });

  revalidatePath("/enrichment");
  return run.id;
}

// ─── Apply proposal ───────────────────────────────────────────────────────────

export async function applyProposal(proposalId: number, approvedFields: string[]): Promise<void> {
  const proposal = await db.enrichmentProposal.findFirst({
    where: { id: proposalId, tenantId: TENANT_ID },
  });
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const changes = proposal.changes as unknown as ChangesMap;
  const allFields = Object.keys(changes);
  const updateData: Record<string, unknown> = {};
  for (const field of approvedFields) {
    if (changes[field]) updateData[field] = changes[field].proposed;
  }

  if (Object.keys(updateData).length > 0) {
    if (proposal.entityType === "company") {
      const before = await db.company.findFirst({ where: { id: proposal.entityId, tenantId: TENANT_ID } });
      await db.company.update({ where: { id: proposal.entityId }, data: updateData });
      audit("company", proposal.entityId, "update",
        before as unknown as Record<string, unknown>,
        { ...updateData, _enrichmentProposalId: proposalId });
      revalidatePath(`/companies/${proposal.entityId}`);
    } else {
      const before = await db.person.findFirst({ where: { id: proposal.entityId, tenantId: TENANT_ID } });
      await db.person.update({ where: { id: proposal.entityId }, data: updateData });
      audit("person", proposal.entityId, "update",
        before as unknown as Record<string, unknown>,
        { ...updateData, _enrichmentProposalId: proposalId });
      revalidatePath(`/persons/${proposal.entityId}`);
    }
  }

  const updatedChanges: ChangesMap = {};
  for (const field of allFields) {
    updatedChanges[field] = { ...changes[field], status: approvedFields.includes(field) ? "approved" : "rejected" };
  }

  const approvedCount = approvedFields.length;
  const rejectedCount = allFields.length - approvedCount;

  await db.enrichmentProposal.update({
    where: { id: proposalId },
    data: {
      changes: updatedChanges as unknown as object,
      overallStatus: approvedCount === 0 ? "rejected" : rejectedCount === 0 ? "approved" : "partial",
    },
  });

  revalidatePath("/enrichment");
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

export async function getProposalsByRun(runId: number) {
  return db.enrichmentProposal.findMany({
    where: { tenantId: TENANT_ID, runId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getEnrichmentRuns() {
  return db.enrichmentRun.findMany({
    where: { tenantId: TENANT_ID },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { proposals: true } } },
  });
}

export async function getPendingProposals() {
  return db.enrichmentProposal.findMany({
    where: { tenantId: TENANT_ID, overallStatus: { in: ["pending", "rejected"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { run: { select: { entityType: true, triggeredBy: true } } },
  });
}
