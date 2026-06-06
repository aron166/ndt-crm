"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";

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
