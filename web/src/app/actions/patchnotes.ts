"use server";

import { db } from "@/lib/db";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { isPatchRepo, type PatchState } from "@/lib/patchnotes/repos";

const TENANT_ID = 1;

/**
 * Set (or clear, state = null = "not yet") the signed-in user's manual-test
 * verdict on one step. Scoped to the caller's tenant + user id; the client
 * never names a user. No audit row: a personal checklist tick, not CRM data.
 */
export async function setPatchStepState(repo: string, prNumber: number, stepIndex: number, state: PatchState | null) {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };

  if (!isPatchRepo(repo)) return { error: "Ismeretlen repó." };
  if (!Number.isInteger(prNumber) || prNumber < 1 || prNumber > 1_000_000) return { error: "Érvénytelen PR szám." };
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > 99) return { error: "Érvénytelen lépés." };
  if (state !== null && state !== "ok" && state !== "bug") return { error: "Érvénytelen állapot." };

  const key = { tenantId: TENANT_ID, userId, repo, prNumber, stepIndex };
  if (state === null) {
    await db.patchTestMark.deleteMany({ where: key });
  } else {
    await db.patchTestMark.upsert({
      where: { tenantId_userId_repo_prNumber_stepIndex: key },
      create: { ...key, state },
      update: { state },
    });
  }
  return { ok: true as const };
}
