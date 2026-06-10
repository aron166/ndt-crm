import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { conditionsPass, buildCreateTaskData } from "./engine";
import type { AutomationEvent, CreateTaskActionConfig, TriggerConfig } from "./types";

export interface IdleRunResult {
  rulesEvaluated: number;
  tasksCreated: number;
}

/**
 * Evaluate the time-based `deal_idle_in_stage` rules. Called by the scheduled
 * cron (POST/GET /api/cron/automations), not by request-time mutations.
 *
 * For each active idle rule: find deals that have sat in (the configured, or
 * any) stage at least `idleDays` days, pass the rule's conditions, and create
 * the task. Dedupe is firing-first inside a transaction — the unique
 * (rule, deal, stageEnteredAt) constraint makes a repeated run idempotent and a
 * duplicate firing rolls the task back, so a deal gets at most one task per
 * stage entry (and can fire again after it moves to a new stage).
 */
export async function runIdleAutomations(now: Date = new Date()): Promise<IdleRunResult> {
  let tasksCreated = 0;

  const rules = await db.automationRule.findMany({
    where: { triggerType: "deal_idle_in_stage", isActive: true },
  });

  for (const rule of rules) {
    try {
      const tc = (rule.triggerConfig ?? {}) as TriggerConfig;
      const idleDays = Number(tc.idleDays);
      if (!Number.isFinite(idleDays) || idleDays <= 0) continue;

      const cfg = rule.actionConfig as unknown as CreateTaskActionConfig;
      if (rule.actionType !== "create_task" || !cfg?.titleTemplate) continue;

      const cutoff = new Date(now.getTime() - idleDays * 86_400_000);

      const deals = await db.deal.findMany({
        where: {
          tenantId: rule.tenantId,
          stageEnteredAt: { lte: cutoff },
          ...(tc.stageId != null ? { stageId: tc.stageId } : {}),
        },
        select: {
          id: true, companyId: true, personId: true, value: true, stageId: true,
          stageEnteredAt: true,
          company: { select: { name: true } },
        },
      });

      for (const deal of deals) {
        if (!deal.stageEnteredAt) continue;

        const event: AutomationEvent = {
          type: "deal_idle_in_stage",
          tenantId: rule.tenantId,
          companyId: deal.companyId,
          personId: deal.personId,
          dealId: deal.id,
          companyName: deal.company?.name ?? null,
          fields: {
            company: deal.company?.name ?? null,
            value: deal.value != null ? Number(deal.value) : null,
            stageId: deal.stageId,
          },
        };
        if (!conditionsPass(rule.conditions, event.fields)) continue;

        try {
          await db.$transaction(async (tx) => {
            await tx.automationFiring.create({
              data: {
                tenantId: rule.tenantId, ruleId: rule.id,
                dealId: deal.id, stageEnteredAt: deal.stageEnteredAt!,
              },
            });
            await tx.task.create({ data: buildCreateTaskData(cfg, event, now) });
          });
          tasksCreated++;
        } catch (err) {
          // Unique (rule, deal, stageEnteredAt) violation = already fired for this
          // stage entry → expected on every subsequent run, skip silently.
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
          reportError("automations.idle", err, { ruleId: rule.id, dealId: deal.id });
        }
      }

      await db.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: now } });
    } catch (err) {
      reportError("automations.idle", err, { ruleId: rule.id });
    }
  }

  return { rulesEvaluated: rules.length, tasksCreated };
}
