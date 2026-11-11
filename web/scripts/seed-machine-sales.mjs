// Machine sales configuration for one tenant: the "gepeladas" question set with its 12 first-call questions,
// and the "Gépeladás" deal pipeline (stages + custom fields), then tenants.settings.machineSalePipelineId.
// Idempotent: re-running adds only what is missing. It never edits or deletes an existing question, stage or
// field (Áron may have re-worded them at /leads/setup or /deals/setup). Config only: no lead, deal or answer is touched.
// Usage (from web/):
//   node scripts/seed-machine-sales.mjs --tenant 1            # dry run, prints the plan, writes nothing
//   node scripts/seed-machine-sales.mjs --tenant 1 --apply    # writes, in ONE transaction, tenant row locked
// Reads DIRECT_URL (or DATABASE_URL) from the environment or web/.env.local. planMachineSales is pure (tested).
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { QUESTION_MAX, SETS_MAX, questionsFromSettings, setsFromSettings } from "../src/lib/leads/qualification.ts";
import { MACHINE_QUESTIONS, MACHINE_SET_DEF, MACHINE_PIPELINE, MACHINE_PIPELINE_SETTING } from "../src/lib/leads/machine-sales.ts";

/**
 * state = { settings, pipelines: [{ id, name, isArchived, position, stages: [{ name, position }], fields: [{ key, position }] }] }
 * Returns { settings: next settings or null when unchanged, pipeline: { create } | { id, addStages, addFields }, summary }.
 */
export function planMachineSales(state) {
  const settings = state.settings && typeof state.settings === "object" ? state.settings : {};
  const questions = questionsFromSettings(settings);
  const sets = setsFromSettings(settings, questions);
  const haveSlugs = new Set(questions.map((q) => q.slug));
  const addQuestions = MACHINE_QUESTIONS.filter((q) => !haveSlugs.has(q.slug));
  const addSet = !sets.some((s) => s.key === MACHINE_SET_DEF.key);
  // Past the caps questionsFromSettings drops the WHOLE stored list back to the defaults: refuse instead.
  if (questions.length + addQuestions.length > QUESTION_MAX) throw new Error(`more than ${QUESTION_MAX} questions after the merge`);
  if (sets.length + (addSet ? 1 : 0) > SETS_MAX) throw new Error(`more than ${SETS_MAX} question sets after the merge`);

  const configuredId = settings[MACHINE_PIPELINE_SETTING];
  const existing =
    state.pipelines.find((p) => p.id === configuredId && !p.isArchived) ??
    state.pipelines.find((p) => p.name === MACHINE_PIPELINE.name && !p.isArchived) ??
    null;

  let pipeline;
  if (existing) {
    const stageNames = new Set(existing.stages.map((s) => s.name));
    const fieldKeys = new Set(existing.fields.map((f) => f.key));
    const nextStagePos = Math.max(-1, ...existing.stages.map((s) => s.position)) + 1;
    const nextFieldPos = Math.max(-1, ...existing.fields.map((f) => f.position)) + 1;
    pipeline = {
      id: existing.id,
      addStages: MACHINE_PIPELINE.stages.filter((s) => !stageNames.has(s.name)).map((s, i) => ({ ...s, position: nextStagePos + i })),
      addFields: MACHINE_PIPELINE.customFields.filter((f) => !fieldKeys.has(f.key)).map((f, i) => ({ ...f, position: nextFieldPos + i })),
    };
  } else {
    pipeline = {
      create: {
        name: MACHINE_PIPELINE.name,
        description: MACHINE_PIPELINE.description,
        // Last position: convertLeadToDeal takes the FIRST pipeline as the default for scan jobs.
        position: Math.max(-1, ...state.pipelines.map((p) => p.position)) + 1,
        stages: MACHINE_PIPELINE.stages.map((s, i) => ({ ...s, position: i })),
        fields: MACHINE_PIPELINE.customFields.map((f, i) => ({ ...f, position: i })),
      },
    };
  }

  const settingsChange = addQuestions.length > 0 || addSet || !existing || existing.id !== configuredId;
  const next = settingsChange
    ? {
        ...settings,
        qualificationQuestions: [...questions, ...addQuestions],
        qualificationSets: addSet ? [...sets, MACHINE_SET_DEF] : sets,
        // Filled in by applyPlan once the pipeline id is known.
        [MACHINE_PIPELINE_SETTING]: existing ? existing.id : null,
      }
    : null;

  return {
    settings: next,
    pipeline,
    summary: {
      addQuestions: addQuestions.map((q) => q.slug),
      addSet,
      pipeline: pipeline.create ? `create "${pipeline.create.name}"` : `keep #${pipeline.id}`,
      addStages: (pipeline.create?.stages ?? pipeline.addStages).map((s) => s.name),
      addFields: (pipeline.create?.fields ?? pipeline.addFields).map((f) => f.key),
    },
  };
}

export async function loadState(c, tenant) {
  const t = await c.query("SELECT settings FROM tenants WHERE id = $1 FOR UPDATE", [tenant]);
  if (t.rowCount !== 1) throw new Error(`tenant ${tenant} not found`);
  const p = await c.query(
    "SELECT id, name, is_archived, position FROM pipelines WHERE tenant_id = $1 ORDER BY position, id",
    [tenant],
  );
  const pipelines = [];
  for (const r of p.rows) {
    const s = await c.query("SELECT name, position FROM pipeline_stages WHERE pipeline_id = $1", [r.id]);
    const f = await c.query("SELECT key, position FROM pipeline_custom_fields WHERE pipeline_id = $1", [r.id]);
    pipelines.push({ id: r.id, name: r.name, isArchived: r.is_archived, position: r.position, stages: s.rows, fields: f.rows });
  }
  return { settings: t.rows[0].settings, pipelines };
}

async function insertStages(c, pipelineId, stages) {
  for (const s of stages) {
    await c.query(
      "INSERT INTO pipeline_stages (pipeline_id, name, probability, position, is_terminal_won, is_terminal_lost) VALUES ($1,$2,$3,$4,$5,$6)",
      [pipelineId, s.name, s.probability, s.position, !!s.isTerminalWon, !!s.isTerminalLost],
    );
  }
}

async function insertFields(c, pipelineId, fields) {
  for (const f of fields) {
    await c.query(
      "INSERT INTO pipeline_custom_fields (pipeline_id, key, label, type, position, options) VALUES ($1,$2,$3,$4,$5,$6)",
      [pipelineId, f.key, f.label, f.type, f.position, f.options ? JSON.stringify(f.options) : null],
    );
  }
}

/** Runs inside the caller's transaction. */
export async function applyPlan(c, tenant, plan) {
  let pipelineId = plan.pipeline.id;
  if (plan.pipeline.create) {
    const { name, description, position, stages, fields } = plan.pipeline.create;
    const r = await c.query(
      "INSERT INTO pipelines (tenant_id, name, description, position, updated_at) VALUES ($1,$2,$3,$4, now()) RETURNING id",
      [tenant, name, description, position],
    );
    pipelineId = r.rows[0].id;
    await insertStages(c, pipelineId, stages);
    await insertFields(c, pipelineId, fields);
  } else {
    await insertStages(c, pipelineId, plan.pipeline.addStages);
    await insertFields(c, pipelineId, plan.pipeline.addFields);
  }
  if (plan.settings) {
    const next = { ...plan.settings, [MACHINE_PIPELINE_SETTING]: pipelineId };
    await c.query("UPDATE tenants SET settings = $2 WHERE id = $1", [tenant, JSON.stringify(next)]);
  }
  return { pipelineId };
}

async function main() {
  const args = process.argv.slice(2);
  const tenantArg = args.includes("--tenant") ? args[args.indexOf("--tenant") + 1] : null;
  const tenant = Number(tenantArg);
  if (!Number.isInteger(tenant) || tenant < 1) { console.error("usage: node scripts/seed-machine-sales.mjs --tenant <id> [--apply]"); process.exit(2); }
  const apply = args.includes("--apply");
  const envFile = new URL("../.env.local", import.meta.url);
  const env = { ...process.env };
  if (fs.existsSync(envFile)) {
    for (const l of fs.readFileSync(envFile, "utf8").split("\n")) {
      const i = l.indexOf("=");
      if (i > 0 && !l.startsWith("#")) env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, "");
    }
  }
  const raw = env.DIRECT_URL || env.DATABASE_URL || "";
  if (!raw) { console.error("DIRECT_URL or DATABASE_URL is required"); process.exit(1); }
  const u = new URL(raw); u.searchParams.delete("pgbouncer"); u.searchParams.delete("sslmode");
  const { default: pg } = await import("pg");
  // A local throwaway Postgres has no TLS; Supabase does.
  const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
  const c = new pg.Client({ connectionString: u.toString(), ssl: local ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("BEGIN");
    const plan = planMachineSales(await loadState(c, tenant));
    console.log(JSON.stringify(plan.summary, null, 2));
    if (!apply) { await c.query("ROLLBACK"); console.log("dry run: nothing written (add --apply)"); return; }
    const res = await applyPlan(c, tenant, plan);
    await c.query("COMMIT");
    console.log("applied:", JSON.stringify(res));
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
