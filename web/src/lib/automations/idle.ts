import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { conditionsPass, buildCreateTaskData, auditRuleTask, runAutomationAction } from "./engine";
import { getLeadExtras } from "@/lib/leads/board";
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
    where: { triggerType: { in: ["deal_idle_in_stage", "lead_idle"] }, isActive: true },
  });

  for (const rule of rules) {
    if (rule.triggerType === "lead_idle") {
      try {
        tasksCreated += await runLeadIdleRule(rule, now);
      } catch (err) {
        reportError("automations.lead_idle", err, { ruleId: rule.id });
      }
      continue;
    }
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
          const data = buildCreateTaskData(cfg, event, now);
          const task = await db.$transaction(async (tx) => {
            await tx.automationFiring.create({
              data: {
                tenantId: rule.tenantId, ruleId: rule.id,
                dealId: deal.id, stageEnteredAt: deal.stageEnteredAt!,
              },
            });
            return tx.task.create({ data, select: { id: true } });
          });
          tasksCreated++;
          if (task?.id) await auditRuleTask(task.id, data, rule.id, rule.tenantId);
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

type Rule = Awaited<ReturnType<typeof db.automationRule.findMany>>[number];

/**
 * lead_idle: open, unconverted leads (optionally in one status) whose last
 * interaction (lead / company / person) — or creation, if none — is older than
 * idleDays. Fires each rule at most once per lead (unique rule_id+lead_id on
 * automation_firings; P2002 = already fired → skip). Any action type works.
 * ponytail: once-per-lead dedupe; re-key on last-contact time if a lead needs
 * to re-enter a nurture sequence after going quiet again.
 */
async function runLeadIdleRule(rule: Rule, now: Date): Promise<number> {
  const tc = (rule.triggerConfig ?? {}) as TriggerConfig;
  const idleDays = Number(tc.idleDays);
  if (!Number.isFinite(idleDays) || idleDays <= 0) return 0;
  const cutoff = new Date(now.getTime() - idleDays * 86_400_000);

  const leads = await db.lead.findMany({
    where: {
      tenantId: rule.tenantId, outcome: "open", convertedDealId: null,
      createdAt: { lte: cutoff },
      ...(tc.status ? { status: tc.status } : {}),
      firings: { none: { ruleId: rule.id } },
    },
    select: {
      id: true, status: true, outcome: true, channel: true, source: true, serviceInterest: true,
      companyId: true, createdAt: true, estimatedValue: true,
      company: { select: { name: true } },
      contact: { select: { personId: true } },
    },
    take: 500, // ponytail: cron batch cap; the rest is picked up next run
  });
  if (leads.length === 0) return 0;

  const extras = await getLeadExtras(
    rule.tenantId,
    leads.map((l) => ({ id: l.id, companyId: l.companyId, personId: l.contact?.personId ?? null, createdAt: l.createdAt })),
  );

  let fired = 0;
  for (const lead of leads) {
    const last = extras.get(lead.id)?.lastContactAt ?? lead.createdAt;
    if (last > cutoff) continue;
    const idle = Math.floor((now.getTime() - last.getTime()) / 86_400_000);
    const event: AutomationEvent = {
      type: "lead_idle",
      tenantId: rule.tenantId, leadId: lead.id,
      companyId: lead.companyId, personId: lead.contact?.personId ?? null,
      companyName: lead.company?.name ?? null,
      fields: {
        company: lead.company?.name ?? null, status: lead.status, outcome: lead.outcome,
        channel: lead.channel, source: lead.source, serviceInterest: lead.serviceInterest,
        estimatedValue: lead.estimatedValue != null ? Number(lead.estimatedValue) : null,
        idleDays: idle,
      },
    };
    if (!conditionsPass(rule.conditions, event.fields)) continue;

    try {
      // Claim first — the unique (rule, lead) row is the idempotency key.
      await db.automationFiring.create({
        data: { tenantId: rule.tenantId, ruleId: rule.id, leadId: lead.id, stageEnteredAt: last },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
    try {
      if (await runAutomationAction(rule, event)) fired++;
    } catch (err) {
      reportError("automations.lead_idle", err, { ruleId: rule.id, leadId: lead.id });
    }
  }
  await db.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: now } });
  return fired;
}
