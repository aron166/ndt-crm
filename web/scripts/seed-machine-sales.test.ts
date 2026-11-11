// The plan is untyped .mjs output; the tests read its branches directly.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_QUALIFICATION_QUESTIONS, questionsFromSettings, questionsInSet, setsFromSettings } from "@/lib/leads/qualification";
import { MACHINE_PIPELINE, MACHINE_QUESTIONS, MACHINE_SET } from "@/lib/leads/machine-sales";
import { applyPlan, planMachineSales } from "./seed-machine-sales.mjs";

const DEFAULT_PIPE = { id: 1, name: "Értékesítés", isArchived: false, position: 0, stages: [{ name: "Új", position: 0 }], fields: [] };

describe("planMachineSales", () => {
  it("fresh tenant: creates the pipeline last, adds the set and every question, keeps the defaults", () => {
    const plan: any = planMachineSales({ settings: {}, pipelines: [DEFAULT_PIPE] });
    expect(plan.pipeline.create).toMatchObject({ name: "Gépeladás", position: 1 });
    expect(plan.pipeline.create.stages).toHaveLength(MACHINE_PIPELINE.stages.length);
    const next = plan.settings!;
    // The stored list round-trips through the same parser the app uses: nothing falls back to defaults.
    const qs = questionsFromSettings(next);
    expect(qs.map((q) => q.slug)).toEqual([...DEFAULT_QUALIFICATION_QUESTIONS.map((q) => q.slug), ...MACHINE_QUESTIONS.map((q) => q.slug)]);
    expect(questionsInSet(qs, MACHINE_SET)).toHaveLength(MACHINE_QUESTIONS.length);
    expect(setsFromSettings(next, qs).map((s) => s.key)).toContain(MACHINE_SET);
  });

  it("keeps a tenant's edited questions and adds only missing slugs", () => {
    const edited = [{ slug: "gate", label: "Átírt kérdés" }, { ...MACHINE_QUESTIONS[0], label: "Péter saját szavai" }];
    const plan: any = planMachineSales({ settings: { qualificationQuestions: edited, other: 1 }, pipelines: [DEFAULT_PIPE] });
    const qs = questionsFromSettings(plan.settings);
    expect(qs.find((q) => q.slug === "gate")?.label).toBe("Átírt kérdés");
    expect(qs.find((q) => q.slug === "pain_story")?.label).toBe("Péter saját szavai");
    expect(qs.filter((q) => q.slug === "pain_story")).toHaveLength(1);
    expect(plan.settings.other).toBe(1);
  });

  it("is idempotent: a fully applied tenant plans no change", () => {
    const first: any = planMachineSales({ settings: {}, pipelines: [DEFAULT_PIPE] });
    const pipe = {
      id: 9, name: "Gépeladás", isArchived: false, position: 1,
      stages: first.pipeline.create.stages, fields: first.pipeline.create.fields,
    };
    const again: any = planMachineSales({ settings: { ...first.settings, machineSalePipelineId: 9 }, pipelines: [DEFAULT_PIPE, pipe] });
    expect(again.settings).toBeNull();
    expect(again.pipeline).toEqual({ id: 9, addStages: [], addFields: [] });
  });

  it("an existing Gépeladás pipeline gets only its missing stages and fields, appended", () => {
    const pipe = { id: 9, name: "Gépeladás", isArchived: false, position: 1, stages: [{ name: "Bemutató lefoglalva", position: 0 }], fields: [{ key: "offer_sent_at", position: 4 }] };
    const plan: any = planMachineSales({ settings: {}, pipelines: [DEFAULT_PIPE, pipe] });
    expect(plan.pipeline.id).toBe(9);
    expect(plan.pipeline.addStages.map((s: { name: string }) => s.name)).not.toContain("Bemutató lefoglalva");
    expect(plan.pipeline.addStages[0].position).toBe(1);
    expect(plan.pipeline.addFields.map((f: { key: string }) => f.key)).not.toContain("offer_sent_at");
    expect(plan.pipeline.addFields[0].position).toBe(5);
    expect(plan.settings.machineSalePipelineId).toBe(9);
  });

  it("refuses a merge past the 40-question cap instead of losing the stored list", () => {
    const many = Array.from({ length: 35 }, (_, i) => ({ slug: `q${i}`, label: `Q${i}` }));
    expect(() => planMachineSales({ settings: { qualificationQuestions: many }, pipelines: [] })).toThrow(/40/);
  });
});

describe("applyPlan", () => {
  it("creates pipeline, stages, fields, then writes the new pipeline id into settings", async () => {
    const calls: [string, unknown[]][] = [];
    const c = { query: vi.fn(async (sql: string, p: unknown[]) => { calls.push([sql, p]); return { rows: [{ id: 42 }] }; }) };
    const plan: any = planMachineSales({ settings: {}, pipelines: [DEFAULT_PIPE] });
    expect(await applyPlan(c, 1, plan)).toEqual({ pipelineId: 42 });
    expect(calls.filter(([s]) => s.startsWith("INSERT INTO pipeline_stages"))).toHaveLength(MACHINE_PIPELINE.stages.length);
    expect(calls.filter(([s]) => s.startsWith("INSERT INTO pipeline_custom_fields"))).toHaveLength(MACHINE_PIPELINE.customFields.length);
    const upd = calls.find(([s]) => s.startsWith("UPDATE tenants"))!;
    expect(JSON.parse(upd[1][1] as string).machineSalePipelineId).toBe(42);
  });
});
