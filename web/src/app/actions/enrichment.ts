"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import Groq from "groq-sdk";

const TENANT_ID = 1;
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldChange {
  current: string | null;
  proposed: string;
  source: string;
  confidence: number;
  status: "pending" | "approved" | "rejected";
}

export type ChangesMap = Record<string, FieldChange>;

interface GroqCompanyResult {
  status?: string;
  website?: string;
  sector?: string;
  notes?: string;
  confidence: Record<string, number>;
  sources: Record<string, string>;
}

interface GroqPersonResult {
  linkedinUrl?: string;
  notes?: string;
  confidence: Record<string, number>;
  sources: Record<string, string>;
}

// ─── Groq client (lazy — only instantiated server-side) ──────────────────────

function getGroq(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  return new Groq({ apiKey });
}

// ─── Hungarian company registry check ────────────────────────────────────────

interface RegistryResult {
  found: boolean;
  dissolved: boolean;
  liquidation: boolean;
  raw: string;
}

async function checkHungarianRegistry(vatNumber: string): Promise<RegistryResult | null> {
  try {
    // Strip branch suffix (last 2 digits) to get the 8-digit core
    const vatCore = vatNumber.replace(/-/g, "").slice(0, 8);
    const url = `https://e-cegjegyzek.im.gov.hu/cegkereses/cegkivonat.html?cegid=${vatCore}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NDT-CRM-Enrichment/1.0)" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();
    const lower = html.toLowerCase();

    return {
      found: !lower.includes("nem található") && !lower.includes("not found"),
      dissolved: lower.includes("törölt") || lower.includes("megszűnt"),
      liquidation: lower.includes("felszámolás") || lower.includes("f.a."),
      raw: html.slice(0, 2000),
    };
  } catch {
    return null;
  }
}

// ─── Company enrichment ───────────────────────────────────────────────────────

async function buildCompanyChanges(
  company: {
    id: number;
    name: string;
    vatNumber: string | null;
    city: string | null;
    website: string | null;
    status: string | null;
    country: string | null;
  },
  registry: RegistryResult | null,
): Promise<ChangesMap> {
  const groq = getGroq();

  const registryContext = registry
    ? `Hungarian company registry check: found=${registry.found}, dissolved=${registry.dissolved}, liquidation=${registry.liquidation}`
    : "Hungarian company registry: unavailable (timeout or 404)";

  const systemPrompt = `You are a business intelligence assistant specializing in Hungarian companies.
Return ONLY a JSON object with this exact shape — no prose, no markdown, no extra keys:
{
  "status": "active" | "inactive" | "F.A." | null,
  "website": string | null,
  "sector": string | null,
  "notes": string | null,
  "confidence": { "status": 0.0-1.0, "website": 0.0-1.0, "sector": 0.0-1.0, "notes": 0.0-1.0 },
  "sources": { "status": "registry|inference|unknown", "website": "inference|unknown", "sector": "inference|unknown", "notes": "inference|unknown" }
}
Only include fields where you have actual information. Use null when uncertain. Confidence must be honest — not inflated.`;

  const userPrompt = `Company: ${company.name}
VAT number: ${company.vatNumber ?? "unknown"}
City: ${company.city ?? "unknown"}
Country: ${company.country ?? "Hungary"}
Current website: ${company.website ?? "none"}
Current status: ${company.status ?? "unknown"}
${registryContext}

Reason about:
1. Is this company still active? (use registry data + your knowledge)
2. What is their probable current website?
3. What industry/sector are they in (based on name + context)?
4. Any relevant notes about this company?

Respond with JSON only.`;

  let raw = "";
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 512,
    });
    raw = completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    throw new Error(`Groq API error: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: GroqCompanyResult;
  try {
    // Strip potential markdown fences
    const jsonStr = raw.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
    parsed = JSON.parse(jsonStr) as GroqCompanyResult;
  } catch {
    throw new Error(`Groq returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const changes: ChangesMap = {};
  const fieldMap: Array<{ key: keyof GroqCompanyResult; companyField: string; current: string | null }> = [
    { key: "status", companyField: "status", current: company.status },
    { key: "website", companyField: "website", current: company.website },
    { key: "sector", companyField: "industryCode", current: null },
    { key: "notes", companyField: "notes", current: null },
  ];

  for (const { key, companyField, current } of fieldMap) {
    const proposed = parsed[key] as string | null | undefined;
    const confidence = parsed.confidence?.[key] ?? 0;
    const source = parsed.sources?.[key] ?? "inference";

    if (proposed && proposed !== current && confidence > 0.5) {
      changes[companyField] = {
        current: current ?? null,
        proposed,
        source,
        confidence,
        status: "pending",
      };
    }
  }

  return changes;
}

export async function enrichCompany(companyId: number): Promise<void> {
  const company = await db.company.findFirst({
    where: { id: companyId, tenantId: TENANT_ID },
    select: { id: true, name: true, vatNumber: true, city: true, website: true, status: true, country: true },
  });
  if (!company) throw new Error(`Company ${companyId} not found`);

  const registry = company.vatNumber
    ? await checkHungarianRegistry(company.vatNumber)
    : null;

  const changes = await buildCompanyChanges(company, registry);
  return void changes; // caller (triggerBulkEnrichment) handles the DB write
}

// ─── Person enrichment ────────────────────────────────────────────────────────

async function buildPersonChanges(
  person: {
    id: number;
    firstName: string;
    lastName: string;
    linkedinUrl: string | null;
    notes: string | null;
  },
  currentEmployer: { companyName: string; role: string | null } | null,
): Promise<ChangesMap> {
  const groq = getGroq();

  const systemPrompt = `You are a professional network intelligence assistant.
Return ONLY a JSON object with this exact shape — no prose, no markdown, no extra keys:
{
  "linkedinUrl": string | null,
  "notes": string | null,
  "confidence": { "linkedinUrl": 0.0-1.0, "notes": 0.0-1.0 },
  "sources": { "linkedinUrl": "inference|unknown", "notes": "inference|unknown" }
}
For linkedinUrl: only return a URL if you are genuinely confident. Use the format https://linkedin.com/in/<slug>.
For notes: if you have useful context, prefix it with "Enrichment: ".
Use null when uncertain. Confidence must be honest.`;

  const fullName = `${person.firstName} ${person.lastName}`;
  const employerContext = currentEmployer
    ? `Current employer: ${currentEmployer.companyName}, role: ${currentEmployer.role ?? "unknown"}`
    : "Current employer: unknown";

  const userPrompt = `Person: ${fullName}
${employerContext}
Country context: Hungary (NDT inspection industry)
Existing LinkedIn URL: ${person.linkedinUrl ?? "none"}

Reason about:
1. What is the likely LinkedIn profile URL for this person?
2. Are there any publicly known facts that would help contextualize this person in their industry?

Respond with JSON only.`;

  let raw = "";
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 256,
    });
    raw = completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    throw new Error(`Groq API error: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: GroqPersonResult;
  try {
    const jsonStr = raw.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
    parsed = JSON.parse(jsonStr) as GroqPersonResult;
  } catch {
    throw new Error(`Groq returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const changes: ChangesMap = {};

  const linkedinProposed = parsed.linkedinUrl;
  const linkedinConf = parsed.confidence?.linkedinUrl ?? 0;
  if (linkedinProposed && linkedinProposed !== person.linkedinUrl && linkedinConf > 0.5) {
    changes["linkedinUrl"] = {
      current: person.linkedinUrl ?? null,
      proposed: linkedinProposed,
      source: parsed.sources?.linkedinUrl ?? "inference",
      confidence: linkedinConf,
      status: "pending",
    };
  }

  const notesProposed = parsed.notes;
  const notesConf = parsed.confidence?.notes ?? 0;
  if (notesProposed && notesConf > 0.5) {
    // Append-only: prepend "Enrichment: " if not already there
    const safeNote = notesProposed.startsWith("Enrichment:")
      ? notesProposed
      : `Enrichment: ${notesProposed}`;
    const combined = person.notes ? `${person.notes}\n${safeNote}` : safeNote;
    changes["notes"] = {
      current: person.notes ?? null,
      proposed: combined,
      source: parsed.sources?.notes ?? "inference",
      confidence: notesConf,
      status: "pending",
    };
  }

  return changes;
}

export async function enrichPerson(personId: number): Promise<void> {
  const person = await db.person.findFirst({
    where: { id: personId, tenantId: TENANT_ID },
    select: { id: true, firstName: true, lastName: true, linkedinUrl: true, notes: true },
  });
  if (!person) throw new Error(`Person ${personId} not found`);

  const activeContact = await db.contact.findFirst({
    where: { personId, tenantId: TENANT_ID, endedAt: null },
    include: { company: { select: { name: true } } },
  });
  const currentEmployer = activeContact
    ? { companyName: activeContact.company.name, role: activeContact.role }
    : null;

  const changes = await buildPersonChanges(person, currentEmployer);
  return void changes;
}

// ─── Bulk trigger ─────────────────────────────────────────────────────────────

export async function triggerBulkEnrichment(
  entityType: "company" | "person",
  entityIds: number[],
): Promise<number> {
  // Cap at 20 for the test version
  const cappedIds = entityIds.slice(0, 20);

  const run = await db.enrichmentRun.create({
    data: {
      tenantId: TENANT_ID,
      entityType,
      entityIds: cappedIds,
      status: "running",
      startedAt: new Date(),
    },
  });

  // Process sequentially — Groq free tier has rate limits
  for (const entityId of cappedIds) {
    let changes: ChangesMap = {};
    let rawResponse: string | null = null;
    let proposalStatus = "pending";

    try {
      if (entityType === "company") {
        const company = await db.company.findFirst({
          where: { id: entityId, tenantId: TENANT_ID },
          select: { id: true, name: true, vatNumber: true, city: true, website: true, status: true, country: true },
        });
        if (!company) continue;

        const registry = company.vatNumber
          ? await checkHungarianRegistry(company.vatNumber)
          : null;

        changes = await buildCompanyChanges(company, registry);
        rawResponse = JSON.stringify({ registryChecked: !!registry, fieldsProposed: Object.keys(changes) });

        await db.enrichmentProposal.create({
          data: {
            tenantId: TENANT_ID,
            runId: run.id,
            entityType,
            entityId,
            entityName: company.name,
            changes: changes as unknown as object,
            overallStatus: Object.keys(changes).length > 0 ? "pending" : "rejected",
            rawResponse,
          },
        });
      } else {
        const person = await db.person.findFirst({
          where: { id: entityId, tenantId: TENANT_ID },
          select: { id: true, firstName: true, lastName: true, linkedinUrl: true, notes: true },
        });
        if (!person) continue;

        const activeContact = await db.contact.findFirst({
          where: { personId: entityId, tenantId: TENANT_ID, endedAt: null },
          include: { company: { select: { name: true } } },
        });
        const currentEmployer = activeContact
          ? { companyName: activeContact.company.name, role: activeContact.role }
          : null;

        changes = await buildPersonChanges(person, currentEmployer);
        rawResponse = JSON.stringify({ fieldsProposed: Object.keys(changes) });

        const fullName = `${person.firstName} ${person.lastName}`;
        await db.enrichmentProposal.create({
          data: {
            tenantId: TENANT_ID,
            runId: run.id,
            entityType,
            entityId,
            entityName: fullName,
            changes: changes as unknown as object,
            overallStatus: Object.keys(changes).length > 0 ? "pending" : "rejected",
            rawResponse,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const entityName =
        entityType === "company"
          ? ((await db.company.findFirst({ where: { id: entityId }, select: { name: true } }))?.name ?? String(entityId))
          : String(entityId);

      await db.enrichmentProposal.create({
        data: {
          tenantId: TENANT_ID,
          runId: run.id,
          entityType,
          entityId,
          entityName,
          changes: {},
          overallStatus: "rejected",
          rawResponse: `ERROR: ${message}`,
        },
      });
      proposalStatus = "failed";
    }

    void proposalStatus; // used only for control flow clarity above
  }

  await db.enrichmentRun.update({
    where: { id: run.id },
    data: { status: "done", finishedAt: new Date() },
  });

  revalidatePath("/enrichment");
  return run.id;
}

// ─── Apply proposal ───────────────────────────────────────────────────────────

export async function applyProposal(
  proposalId: number,
  approvedFields: string[],
): Promise<void> {
  const proposal = await db.enrichmentProposal.findFirst({
    where: { id: proposalId, tenantId: TENANT_ID },
  });
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const changes = proposal.changes as unknown as ChangesMap;
  const allFields = Object.keys(changes);

  // Build the update payload for the target entity
  const updateData: Record<string, unknown> = {};
  for (const field of approvedFields) {
    const change = changes[field];
    if (change) {
      updateData[field] = change.proposed;
    }
  }

  // Write to entity
  if (Object.keys(updateData).length > 0) {
    if (proposal.entityType === "company") {
      const before = await db.company.findFirst({
        where: { id: proposal.entityId, tenantId: TENANT_ID },
      });
      await db.company.update({
        where: { id: proposal.entityId },
        data: updateData,
      });
      audit("company", proposal.entityId, "update",
        before as unknown as Record<string, unknown>,
        { ...updateData, _enrichmentProposalId: proposalId });
      revalidatePath(`/companies/${proposal.entityId}`);
    } else {
      const before = await db.person.findFirst({
        where: { id: proposal.entityId, tenantId: TENANT_ID },
      });
      await db.person.update({
        where: { id: proposal.entityId },
        data: updateData,
      });
      audit("person", proposal.entityId, "update",
        before as unknown as Record<string, unknown>,
        { ...updateData, _enrichmentProposalId: proposalId });
      revalidatePath(`/persons/${proposal.entityId}`);
    }
  }

  // Update per-field status in the changes JSON
  const updatedChanges: ChangesMap = {};
  for (const field of allFields) {
    updatedChanges[field] = {
      ...changes[field],
      status: approvedFields.includes(field) ? "approved" : "rejected",
    };
  }

  const approvedCount = approvedFields.length;
  const rejectedCount = allFields.length - approvedCount;
  let overallStatus: string;
  if (approvedCount === 0) {
    overallStatus = "rejected";
  } else if (rejectedCount === 0) {
    overallStatus = "approved";
  } else {
    overallStatus = "partial";
  }

  await db.enrichmentProposal.update({
    where: { id: proposalId },
    data: {
      changes: updatedChanges as unknown as object,
      overallStatus,
    },
  });

  revalidatePath("/enrichment");
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

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
    where: { tenantId: TENANT_ID, overallStatus: "pending" },
    orderBy: { createdAt: "desc" },
    include: { run: { select: { entityType: true, triggeredBy: true } } },
  });
}
