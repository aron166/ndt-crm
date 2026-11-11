import { notFound } from "next/navigation";
import { getActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { getPatchnotes, type Issue, type RepoData } from "@/lib/patchnotes/github";
import { PATCH_UI } from "@/lib/patchnotes/labels";
import type { PatchState } from "@/lib/patchnotes/repos";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import m from "./patchnotes.module.css";
import { StepChecklist } from "./StepChecklist";

export const dynamic = "force-dynamic";
const TENANT_ID = 1;
// Hungarian copy (lib/patchnotes/labels.ts) is PROPOSAL until Áron approves.

const date = (iso: string) => new Date(iso).toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest" });

function IssueList({ label, items }: { label: string; items: Issue[] }) {
  const list = (
    <ul className={m.issues}>
      {items.map((i) => (
        <li key={i.number} className={m.issue}>
          <a className={k.link} href={i.url} target="_blank" rel="noopener noreferrer">#{i.number} {i.title}</a>
        </li>
      ))}
    </ul>
  );
  if (items.length === 0) return <div className={k.muted}>{label}: {PATCH_UI.none}</div>;
  if (items.length <= 3) return <div className={m.issueBlock}>{label} ({items.length}){list}</div>;
  return (
    <details className={m.details}>
      <summary>{label} ({items.length})</summary>
      {list}
    </details>
  );
}

function RepoCard({ r }: { r: RepoData }) {
  return (
    <div className={`${k.card} ${m.repo}`}>
      <div className={k.strong}>{r.repo}</div>
      <div className="font-mono-ndt">
        {PATCH_UI.days7}: {r.merged7} / {PATCH_UI.days28}: {r.merged28}
      </div>
      <IssueList label={PATCH_UI.backlog} items={r.backlog} />
      <IssueList label={PATCH_UI.decisionAron} items={r.decisionAron} />
    </div>
  );
}

export default async function PatchnotesPage() {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) notFound();

  const [data, marks] = await Promise.all([
    getPatchnotes(),
    db.patchTestMark.findMany({ where: { tenantId: TENANT_ID, userId }, select: { repo: true, prNumber: true, stepIndex: true, state: true } }),
  ]);
  const byPr = new Map<string, Record<number, PatchState>>();
  for (const mark of marks) {
    const prKey = `${mark.repo}#${mark.prNumber}`;
    const rec = byPr.get(prKey) ?? {};
    rec[mark.stepIndex] = mark.state as PatchState;
    byPr.set(prKey, rec);
  }

  return (
    <div className={`mount ${m.stack}`}>
      <PageHeader title={PATCH_UI.title} />

      {!data.configured ? (
        <section className={k.card}>
          <div className={k.muted}>{PATCH_UI.noToken}</div>
        </section>
      ) : (
        <>
          <section className={m.section}>
            <h2 className={k.h2}>{PATCH_UI.doneThisWeek}</h2>
            <div className={m.repoGrid}>
              {data.repos.map((r) => <RepoCard key={r.repo} r={r} />)}
            </div>
            {data.errors.length > 0 && (
              <div className={k.muted}>
                {PATCH_UI.errors}: {data.errors.join("; ")}
              </div>
            )}
          </section>

          {data.repos.map((r) => (
            <details key={r.repo} open className={m.repoBlock}>
              <summary className={m.summary}>
                <span className={k.h2}>{r.repo} ({r.merged.length})</span>
              </summary>
              <div className={m.list}>
                {r.merged.length === 0 && <p className={k.muted}>{PATCH_UI.noMerged}</p>}
                {r.merged.map((p) => (
                  <div key={p.number} className={m.pr}>
                    <div className={m.prTitle}>
                      <a className={k.link} href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a>
                      <span className={k.muted}> #{p.number} · {date(p.mergedAt)} · {p.author}</span>
                    </div>
                    {p.steps.length === 0 ? (
                      <div className={k.muted}>{PATCH_UI.noSteps}</div>
                    ) : (
                      <StepChecklist repo={r.repo} prNumber={p.number} prTitle={p.title} steps={p.steps} initial={byPr.get(`${r.repo}#${p.number}`) ?? {}} />
                    )}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </>
      )}
    </div>
  );
}
