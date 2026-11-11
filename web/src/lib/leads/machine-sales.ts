// Machine sales (BirdsView device sale, Mira's MACHINE-SALES-SYSTEM.md 2026-11-11, section 4).
//
// PURE module, shared by the lead page, the won-to-Deal conversion and
// scripts/seed-machine-sales.mjs. Nothing here needs a migration:
//   - the 6 first-call questions are ordinary tenant questions in their own
//     set, so their answers land in leads.qualification + answer_sources like
//     every other answer (form vs setter provenance kept);
//   - "scan job or machine sale" is the existing W2 pair lead.offer_type
//     (service | rental | purchase) with lead.intent as the fallback, and it
//     already travels into deal.custom_fields.offerType on conversion;
//   - the "Gépeladás" deal pipeline is configuration (pipelines, stages,
//     pipeline_custom_fields) created by the seed script, and the conversion
//     finds it through tenants.settings.machineSalePipelineId.
// The capex signer is a text answer (name, role), not a person FK: the signer
// is usually not in the CRM yet on the first call, and an FK needs a migration.
//
// Hungarian wording is PROPOSAL (draft: true shows the "javaslat" chip on the
// setter form) until Áron approves it.

import type { QualificationQuestion, QuestionSet } from "./qualification";

export const MACHINE_SET = "gepeladas";
export const MACHINE_SET_DEF: QuestionSet = { key: MACHINE_SET, label: "Gépeladás" };

/** Settings key the seed script writes and convertLeadToDeal reads. */
export const MACHINE_PIPELINE_SETTING = "machineSalePipelineId";

const YES_NO = ["igen", "nem"];
const q = (slug: string, label: string, type: QualificationQuestion["type"], options?: string[]): QualificationQuestion => ({
  slug, label, type, ...(options ? { options } : {}), sets: [MACHINE_SET], draft: true,
});

/** Question order = the call order (section 4, questions 1 to 6, then the volume estimate). */
export const MACHINE_QUESTIONS: QualificationQuestion[] = [
  q("pain_story", "Mesélj az utolsó munkátokról, ahol nem tudtátok, mi van a betonban. Mi lett belőle, és ki fizette?", "text"),
  q("situations_per_year", "Egy évben hányszor fordul elő ilyen?", "number"),
  q("parallel_sites", "Hány építkezésetek fut egyszerre?", "number"),
  q("operator_role", "Ki mérne nálatok, ha saját gépetek lenne, és ki írná alá az eredményt?", "text"),
  q("use_mode", "Magatoknak kellene az eredmény, vagy a megrendelőiteknek is mérnétek vele?", "choice", ["saját használat", "megrendelőknek is"]),
  q("competing_lab", "Vizsgáló labor, amely ugyanezt a szolgáltatást árulja (versenytárs)?", "choice", YES_NO),
  q("funding_route", "Ha megéri, miből vennétek?", "choice", ["idei keret", "hitel", "bérlet", "mérési díjak beszámítása"]),
  q("budget_window", "Mikor nyílik rá keret?", "text"),
  q("site_outside_budapest", "A telephely vagy a projekt Budapesten kívül van?", "choice", YES_NO),
  q("capex_signer", "Ki dönt egy ilyen eszközről (név, szerep)?", "text"),
  q("capex_signer_at_demo", "Ott tud lenni a bemutatón?", "choice", [...YES_NO, "még nem tudni"]),
  q("units_estimate", "Hány gépre lehet szükség (becslés)?", "number"),
];

/** Offer types and intents that make a lead a machine sale rather than a scan job. */
const MACHINE_KINDS = new Set(["purchase", "rental"]);

/**
 * Scan job or machine sale. offer_type is set at "qualified" and wins; before
 * that the intake intent decides. Anything else (service, vague, unknown, null)
 * is a scan job.
 */
export function isMachineSale(lead: { offerType?: string | null; intent?: string | null }): boolean {
  if (lead.offerType) return MACHINE_KINDS.has(lead.offerType);
  return !!lead.intent && MACHINE_KINDS.has(lead.intent);
}

/** The configured machine-sale pipeline id, or null when the seed has not run. */
export function machinePipelineIdFrom(settings: unknown): number | null {
  const v = (settings as Record<string, unknown> | null)?.[MACHINE_PIPELINE_SETTING];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

// ── Deal pipeline config (section 4, "Gépeladás") ───────────────────

export interface StageDef { name: string; probability: number; isTerminalWon?: boolean; isTerminalLost?: boolean }
export interface CustomFieldDef { key: string; label: string; type: "text" | "number" | "date" | "single_select" | "multi_select"; options?: string[] }

export const MACHINE_PIPELINE = {
  name: "Gépeladás",
  description: "BirdsView gépeladás: bemutató, ajánlat, döntés, finanszírozás, szállítás.",
  stages: [
    { name: "Bemutató lefoglalva", probability: 15 },
    { name: "Bemutató megtartva", probability: 30 },
    { name: "Ajánlat elküldve", probability: 45 },
    { name: "Döntési hívás", probability: 55 },
    { name: "Finanszírozás", probability: 70 },
    { name: "Megrendelve", probability: 90 },
    { name: "Leszállítva, betanítva", probability: 100, isTerminalWon: true },
    { name: "Elveszett", probability: 0, isTerminalLost: true },
  ] as StageDef[],
  customFields: [
    { key: "offer_shape", label: "Ajánlat formája", type: "single_select", options: ["vásárlás", "bérlet", "mérési díjak beszámítása"] },
    { key: "offer_sent_at", label: "Ajánlat elküldve", type: "date" },
    { key: "offer_incentive_until", label: "Kedvezmény eddig", type: "date" },
    { key: "demo_credit_ft", label: "Beszámítható bemutató díj (Ft)", type: "number" },
    { key: "demo_moments", label: "Bemutató pillanatai", type: "multi_select", options: ["művezető kezelte a gépet", "statikus megkapta az adatlapot", "eltérési jegyzőkönyv aláírva"] },
    { key: "unit_count", label: "Gépek száma", type: "number" },
  ] as CustomFieldDef[],
};
