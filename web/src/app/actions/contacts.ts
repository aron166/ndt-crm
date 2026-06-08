"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { createCompany } from "@/app/actions/companies";

const TENANT_ID = 1;

export async function addContact(formData: FormData) {
  const personId  = parseInt(formData.get("personId") as string, 10);
  const companyId = parseInt(formData.get("companyId") as string, 10);
  const role      = (formData.get("role") as string)?.trim() || null;

  if (!personId || !companyId) return { error: "Személy és cég kötelező" };

  const existing = await db.contact.findFirst({
    where: { tenantId: TENANT_ID, personId, companyId, endedAt: null },
  });
  if (existing) return { error: "Ez a kapcsolat már létezik" };

  const contact = await db.contact.create({
    data: { tenantId: TENANT_ID, personId, companyId, role, isPrimary: false },
  });
  await audit("contact", contact.id, "create", null, { personId, companyId, role });

  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/persons/${personId}`);
  return { success: true };
}

export async function createPersonAndLink(formData: FormData) {
  const companyId = parseInt(formData.get("companyId") as string, 10);
  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName  = (formData.get("lastName")  as string)?.trim();
  const email     = (formData.get("email")  as string)?.trim() || null;
  const phone     = (formData.get("phone")  as string)?.trim() || null;
  const role      = (formData.get("role")   as string)?.trim() || null;

  if (!firstName && !lastName) return { error: "Név kötelező" };
  if (!companyId) return { error: "Cég kötelező" };

  const person = await db.person.create({
    data: {
      tenantId: TENANT_ID,
      firstName: firstName || lastName || "?",
      lastName:  lastName  || firstName || "?",
      email: email ?? undefined,
      phone: phone ?? undefined,
    },
  });
  await audit("person", person.id, "create", null, { firstName: person.firstName, lastName: person.lastName, email, companyId });

  const contact = await db.contact.create({
    data: { tenantId: TENANT_ID, personId: person.id, companyId, role, isPrimary: false },
  });
  await audit("contact", contact.id, "create", null, { personId: person.id, companyId, role });

  revalidatePath(`/companies/${companyId}`);
  return { success: true, personId: person.id };
}

/**
 * Set / change a person's CURRENT employer (LinkedIn-style, history-preserving).
 *
 * The bug this fixes: you could only link a person to a company that already
 * existed in the DB, so when someone moved to a company we hadn't recorded yet
 * (e.g. Pikó András → NDT Global Kft.) there was no way to set the new workplace.
 *
 * Person ≠ Contact (decisions.md #1): the Person is permanent, each Contact is a
 * time-bounded employment. So a workplace change is: close the open Contact
 * (set endedAt) and open a new one — never overwrite. We also append an
 * interaction documenting the move (interactions are append-only, #2).
 *
 * Accepts EITHER an existing `companyId`, OR inline new-company fields
 * (`newCompanyName` [+ optional vat/city]) which create the company first.
 */
export async function setCurrentEmployer(formData: FormData) {
  const personId = parseInt(formData.get("personId") as string, 10);
  const role     = (formData.get("role") as string)?.trim() || null;
  const startedAtRaw = (formData.get("startedAt") as string)?.trim();
  const startedAt = startedAtRaw ? new Date(startedAtRaw) : new Date();
  if (startedAtRaw && Number.isNaN(startedAt.getTime())) {
    return { error: "Érvénytelen kezdő dátum" };
  }

  if (!personId) return { error: "Személy kötelező" };

  const person = await db.person.findFirst({
    where: { id: personId, tenantId: TENANT_ID, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!person) return { error: "Személy nem található" };

  // Resolve the target company: an existing one, or create it inline.
  let companyId = parseInt(formData.get("companyId") as string, 10);
  let companyName: string;
  if (Number.isInteger(companyId) && companyId > 0) {
    const company = await db.company.findFirst({
      where: { id: companyId, tenantId: TENANT_ID, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!company) return { error: "Cég nem található" };
    companyName = company.name;
  } else {
    const newCompanyName = (formData.get("newCompanyName") as string)?.trim();
    if (!newCompanyName) return { error: "Válassz céget vagy add meg az új cég nevét" };
    const res = await createCompany({
      name:      newCompanyName,
      vatNumber: (formData.get("newCompanyVat") as string)?.trim() || undefined,
      city:      (formData.get("newCompanyCity") as string)?.trim() || undefined,
    });
    if ("error" in res) return { error: res.error };
    companyId = res.id;
    companyName = newCompanyName;
  }

  // The person's current (open) employment, if any.
  const current = await db.contact.findFirst({
    where: { tenantId: TENANT_ID, personId, endedAt: null },
    include: { company: { select: { id: true, name: true } } },
  });
  if (current && current.companyId === companyId) {
    return { error: "Ez már a jelenlegi munkahely" };
  }

  // Close the old employment at the new job's start date (preserve history).
  // Guard against an endedAt that would precede the old startedAt (invalid range).
  if (current) {
    const endedAt =
      current.startedAt && startedAt < current.startedAt ? new Date() : startedAt;
    await db.contact.update({ where: { id: current.id }, data: { endedAt } });
    await audit("contact", current.id, "update", { endedAt: null }, { endedAt: endedAt.toISOString() });
  }

  // Open the new employment.
  const contact = await db.contact.create({
    data: { tenantId: TENANT_ID, personId, companyId, role, isPrimary: false, startedAt },
  });
  await audit("contact", contact.id, "create", null, { personId, companyId, role, startedAt: startedAt.toISOString() });

  // Append-only interaction documenting the move (the relationship history).
  const note = current
    ? `Munkahelyváltás: ${current.company.name} → ${companyName}${role ? ` (${role})` : ""}`
    : `Munkahely rögzítve: ${companyName}${role ? ` (${role})` : ""}`;
  await db.interaction.create({
    data: { tenantId: TENANT_ID, personId, companyId, type: "note", notes: note, occurredAt: startedAt },
  });

  revalidatePath(`/persons/${personId}`);
  revalidatePath(`/companies/${companyId}`);
  if (current) revalidatePath(`/companies/${current.companyId}`);
  return { success: true, companyId };
}

export async function closeContact(contactId: number, companyId: number, personId: number) {
  await db.contact.updateMany({
    where: { id: contactId, tenantId: TENANT_ID },
    data: { endedAt: new Date() },
  });
  await audit("contact", contactId, "update", { endedAt: null }, { endedAt: new Date().toISOString() });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/persons/${personId}`);
}

// "Person left company" — close contact + auto-create a follow-up task
export async function personLeftCompany(contactId: number, companyId: number, personId: number, endedAt?: Date) {
  const [contact] = await Promise.all([
    db.contact.findFirst({
      where: { id: contactId, tenantId: TENANT_ID },
      include: {
        person:  { select: { firstName: true, lastName: true } },
        company: { select: { name: true } },
      },
    }),
  ]);
  if (!contact) return { error: "Kapcsolat nem található" };

  const leaveDate = endedAt ?? new Date();

  // Close the contact
  await db.contact.updateMany({
    where: { id: contactId, tenantId: TENANT_ID },
    data: { endedAt: leaveDate },
  });
  await audit("contact", contactId, "update", { endedAt: null }, { endedAt: leaveDate.toISOString() });

  // Auto-create follow-up task linked to the person
  const personName = [contact.person.lastName, contact.person.firstName].filter(Boolean).join(" ");
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + 14); // 2 weeks

  await db.task.create({
    data: {
      tenantId: TENANT_ID,
      personId,
      companyId,
      title: `Utánkövetés: ${personName} — hol dolgozik most?`,
      description: `${personName} elhagyta a(z) ${contact.company.name} céget. Derítsd ki, hova ment, és tartsd fenn a kapcsolatot.`,
      type: "call",
      status: "created",
      dueDate: followUpDate,
    },
  });

  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/persons/${personId}`);
  revalidatePath("/tasks");
  return { success: true };
}
