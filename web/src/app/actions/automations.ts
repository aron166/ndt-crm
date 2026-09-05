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

// Fail CLOSED on malformed JSON: an unparseable triggerConfig/conditions must
// abort the write, never silently fall back to a broad (filter-less) rule.
// Empty/absent input is legitimately "no value" → ok with null.
function parseJson<T>(raw: FormDataEntryValue | null): { ok: true; value: T | null } | { ok: false } {
  if (typeof raw !== "string" || raw.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return { ok: false };
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

  const actionParsed = parseJson<Record<string, unknown>>(formData.get("actionConfig"));
  if (!actionParsed.ok) return { error: "Érvénytelen actionConfig JSON" };
  const actionConfig = actionParsed.value;
  if (!actionConfig || typeof actionConfig !== "object") {
    return { error: "Érvénytelen actionConfig" };
  }
  if (actionType === "send_email") {
    if (typeof actionConfig.subjectTemplate !== "string" || !actionConfig.subjectTemplate.trim()) {
      return { error: "Az email tárgya kötelező" };
    }
    if (typeof actionConfig.bodyTemplate !== "string" || !actionConfig.bodyTemplate.trim()) {
      return { error: "Az email szövege kötelező" };
    }
  } else if (actionType === "change_lead_status") {
    if (typeof actionConfig.toStatus !== "string" || !actionConfig.toStatus.trim()) {
      return { error: "A célstátusz kötelező" };
    }
  } else if (actionType === "assign_lead") {
    if (!Number.isInteger(Number(actionConfig.assignedToId)) || Number(actionConfig.assignedToId) <= 0) {
      return { error: "A felelős kötelező" };
    }
  } else if (actionType === "webhook_out") {
    if (typeof actionConfig.url !== "string" || !/^https?:\/\//i.test(actionConfig.url.trim())) {
      return { error: "Érvényes http(s) webhook URL kötelező" };
    }
  } else {
    if (typeof actionConfig.titleTemplate !== "string" || !actionConfig.titleTemplate.trim()) {
      return { error: "A létrehozandó feladat címe kötelező" };
    }
    if (actionConfig.dueInDays != null) {
      const n = Number(actionConfig.dueInDays);
      if (!Number.isFinite(n) || n < 0) return { error: "A határidő (nap) érvénytelen" };
    }
  }

  const condParsed = parseJson<unknown[]>(formData.get("conditions"));
  if (!condParsed.ok) return { error: "Érvénytelen feltétel JSON" };
  const conditions =
    Array.isArray(condParsed.value) && condParsed.value.length > 0 ? condParsed.value : null;

  const trigParsed = parseJson<Record<string, unknown>>(formData.get("triggerConfig"));
  if (!trigParsed.ok) return { error: "Érvénytelen trigger JSON" };
  if (triggerType === "lead_idle" || triggerType === "deal_idle_in_stage") {
    const d = Number(trigParsed.value?.idleDays);
    if (!Number.isFinite(d) || d <= 0) return { error: "A tétlen napok száma legalább 1" };
  }
  const triggerConfig =
    trigParsed.value && typeof trigParsed.value === "object" &&
    Object.keys(trigParsed.value).length > 0 ? trigParsed.value : null;

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
