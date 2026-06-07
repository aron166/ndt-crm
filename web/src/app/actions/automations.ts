"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import {
  TRIGGER_TYPES, ACTION_TYPES,
  type TriggerType, type ActionType,
} from "@/lib/automations/types";

const TENANT_ID = 1;

function parseJson<T>(raw: FormDataEntryValue | null, fallback: T): T {
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface RuleInput {
  name: string;
  triggerType: TriggerType;
  actionType: ActionType;
  triggerConfig: Record<string, unknown> | null;
  conditions: unknown[] | null;
  actionConfig: Record<string, unknown>;
}

// Validate + normalise the shared rule payload used by create and update.
function parseRuleForm(formData: FormData): RuleInput | { error: string } {
  const name = (formData.get("name") as string)?.trim();
  const triggerType = formData.get("triggerType") as string;
  const actionType = (formData.get("actionType") as string) || "create_task";

  if (!name) return { error: "Név kötelező" };
  if (!TRIGGER_TYPES.includes(triggerType as TriggerType)) return { error: "Ismeretlen trigger típus" };
  if (!ACTION_TYPES.includes(actionType as ActionType)) return { error: "Ismeretlen művelet típus" };

  const actionConfig = parseJson<Record<string, unknown>>(formData.get("actionConfig"), {});
  if (typeof actionConfig.titleTemplate !== "string" || !actionConfig.titleTemplate.trim()) {
    return { error: "A létrehozandó feladat címe kötelező" };
  }

  const rawConditions = parseJson<unknown[] | null>(formData.get("conditions"), null);
  const conditions = Array.isArray(rawConditions) && rawConditions.length > 0 ? rawConditions : null;

  const rawTrigger = parseJson<Record<string, unknown> | null>(formData.get("triggerConfig"), null);
  const triggerConfig = rawTrigger && Object.keys(rawTrigger).length > 0 ? rawTrigger : null;

  return {
    name,
    triggerType: triggerType as TriggerType,
    actionType: actionType as ActionType,
    triggerConfig,
    conditions,
    actionConfig,
  };
}

export async function createAutomation(formData: FormData) {
  const parsed = parseRuleForm(formData);
  if ("error" in parsed) return parsed;

  const rule = await db.automationRule.create({
    data: {
      tenantId: TENANT_ID,
      name: parsed.name,
      isActive: true,
      triggerType: parsed.triggerType,
      triggerConfig: parsed.triggerConfig === null ? Prisma.JsonNull : (parsed.triggerConfig as Prisma.InputJsonValue),
      conditions: parsed.conditions === null ? Prisma.JsonNull : (parsed.conditions as Prisma.InputJsonValue),
      actionType: parsed.actionType,
      actionConfig: parsed.actionConfig as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  audit("automation_rule", rule.id, "create", null, {
    name: parsed.name, triggerType: parsed.triggerType, actionType: parsed.actionType,
  });
  revalidatePath("/automations");
  return { success: true };
}

export async function updateAutomation(id: number, formData: FormData) {
  const parsed = parseRuleForm(formData);
  if ("error" in parsed) return parsed;

  const before = await db.automationRule.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { name: true, triggerType: true },
  });
  if (!before) return { error: "Szabály nem található" };

  await db.automationRule.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: {
      name: parsed.name,
      triggerType: parsed.triggerType,
      triggerConfig: parsed.triggerConfig === null ? Prisma.JsonNull : (parsed.triggerConfig as Prisma.InputJsonValue),
      conditions: parsed.conditions === null ? Prisma.JsonNull : (parsed.conditions as Prisma.InputJsonValue),
      actionType: parsed.actionType,
      actionConfig: parsed.actionConfig as Prisma.InputJsonValue,
    },
  });

  audit("automation_rule", id, "update",
    { name: before.name, triggerType: before.triggerType },
    { name: parsed.name, triggerType: parsed.triggerType },
  );
  revalidatePath("/automations");
  return { success: true };
}

export async function toggleAutomation(id: number, isActive: boolean) {
  const before = await db.automationRule.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { isActive: true },
  });
  if (!before) return { error: "Szabály nem található" };

  await db.automationRule.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: { isActive },
  });
  audit("automation_rule", id, "update", { isActive: before.isActive }, { isActive });
  revalidatePath("/automations");
  return { success: true };
}

export async function deleteAutomation(id: number) {
  const before = await db.automationRule.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { name: true, triggerType: true },
  });
  if (!before) return { error: "Szabály nem található" };

  await db.automationRule.deleteMany({ where: { id, tenantId: TENANT_ID } });
  audit("automation_rule", id, "delete", { name: before.name, triggerType: before.triggerType }, null);
  revalidatePath("/automations");
  return { success: true };
}
