"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";

const TENANT_ID = 1;

export async function createPerson(data: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  notes?: string;
}) {
  const firstName = data.firstName.trim();
  const lastName  = data.lastName.trim();
  if (!firstName && !lastName) return { error: "A személy neve kötelező" };

  const person = await db.person.create({
    data: {
      tenantId:   TENANT_ID,
      firstName:  firstName || lastName,
      lastName:   lastName  || firstName,
      email:      data.email?.trim()       || null,
      phone:      data.phone?.trim()       || null,
      linkedinUrl: data.linkedinUrl?.trim() || null,
      notes:      data.notes?.trim()       || null,
    },
  });
  await audit("person", person.id, "create", null, { firstName, lastName });

  revalidatePath("/persons");
  return { success: true, id: person.id };
}

export async function updatePerson(
  id: number,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    linkedinUrl?: string;
    notes?: string;
  }
) {
  const person = await db.person.findFirst({
    where: { id, tenantId: TENANT_ID, deletedAt: null },
  });
  if (!person) return { error: "Személy nem található" };

  const before = {
    firstName: person.firstName, lastName: person.lastName, email: person.email,
  };

  await db.person.update({
    where: { id },
    data: {
      firstName:   data.firstName?.trim()   ?? person.firstName,
      lastName:    data.lastName?.trim()    ?? person.lastName,
      email:       data.email?.trim()       ?? person.email,
      phone:       data.phone?.trim()       ?? person.phone,
      linkedinUrl: data.linkedinUrl?.trim() ?? person.linkedinUrl,
      notes:       data.notes?.trim()       ?? person.notes,
    },
  });
  await audit("person", id, "update", before, {
    firstName: data.firstName ?? person.firstName,
    lastName:  data.lastName  ?? person.lastName,
  });

  revalidatePath("/persons");
  revalidatePath(`/persons/${id}`);
  return { success: true };
}

export async function deletePerson(id: number) {
  const person = await db.person.findFirst({
    where: { id, tenantId: TENANT_ID, deletedAt: null },
    select: { firstName: true, lastName: true },
  });
  if (!person) return { error: "Személy nem található" };

  await db.person.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit("person", id, "delete", { firstName: person.firstName, lastName: person.lastName }, null);

  revalidatePath("/persons");
  return { success: true };
}

export async function restorePerson(id: number) {
  const person = await db.person.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { firstName: true, lastName: true, deletedAt: true },
  });
  if (!person) return { error: "Személy nem található" };
  if (!person.deletedAt) return { success: true }; // already active

  await db.person.update({ where: { id }, data: { deletedAt: null } });
  await audit("person", id, "update", { deletedAt: person.deletedAt }, { deletedAt: null });

  revalidatePath("/persons");
  revalidatePath(`/persons/${id}`);
  return { success: true };
}
