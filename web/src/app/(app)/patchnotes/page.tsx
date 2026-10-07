import { notFound } from "next/navigation";
import { requireCrmUser, getActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { getPatchnotes, type Issue, type RepoData } from "@/lib/patchnotes/github";
import { PATCH_UI } from "@/lib/patchnotes/labels";
import type { PatchState } from "@/lib/patchnotes/repos";
import { StepChecklist } from "./StepChecklist";

export const dynamic = "force-dynamic";
const TENANT_ID = 1;
// Hungarian copy (lib/patchnotes/labels.ts) is PROPOSAL until Áron approves.

const date = (iso: string) => new Date(iso).toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest" });
const wrap = { overflowWrap: "anywhere" } as const;

function IssueList({ label, items }: { label: string; items: Issue[] }) {
  const list = (
    <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12 }}>
      {items.map((i) => (
        <li key={i.number} style={wrap}>
          <a className="tbl-link" href={i.url} target="_blank" rel="noopener noreferrer">#{i.number} {i.title}</a>
        </li>
      ))}
    </ul>
  );
  if (items.length === 0) return <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>{label}: {PATCH_UI.none}</div>;
  if (items.length <= 3) return <div style={{ fontSize: 12 }}>{label} ({items.length}){list}</div>;
  return (
    <details style={{ fontSize: 12 }}>
      <summary>{label} ({items.length})</summary>
      {list}
    </details>
  );
}

function RepoCard({ r }: { r: RepoData }) {
  return (
    <div className="kpi" style={{ display: "grid", gap: 6 }}>
      <div className="k-label">{r.repo}</div>
      <div className="font-mono-ndt" style={{ fontSize: 14 }}>
        {PATCH_UI.days7}: {r.merged7} / {PATCH_UI.days28}: {r.merged28}
      </div>
      <IssueList label={PATCH_UI.backlog} items={r.backlog} />
      <IssueList label={PATCH_UI.decisionAron} items={r.decisionAron} />
    </div>
  );
}

export default async function PatchnotesPage() {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) notFound();
  const { userId } = await getActor(TENANT_ID);

  const [data, marks] = await Promise.all([
    getPatchnotes(),
    db.patchTestMark.findMany({ where: { tenantId: TENANT_ID, userId: userId! }, select: { repo: true, prNumber: true, stepIndex: true, state: true } }),
  ]);
  const byPr = new Map<string, Record<number, PatchState>>();
  for (const m of marks) {
    const k = `${m.repo}#${m.prNumber}`;
    const rec = byPr.get(k) ?? {};
    rec[m.stepIndex] = m.state as PatchState;
    byPr.set(k, rec);
  }

  return (
    <div className="mount space-y-8">
      <div className="page-head">
        <h1 className="page-title">{PATCH_UI.title}</h1>
      </div>

      {!data.configured ? (
        <div className="panel">
          <div className="panel-pad" style={{ fontSize: 13 }}>{PATCH_UI.noToken}</div>
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="panel-title" style={{ fontSize: 16 }}>{PATCH_UI.doneThisWeek}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              {data.repos.map((r) => <RepoCard key={r.repo} r={r} />)}
            </div>
            {data.errors.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>
                {PATCH_UI.errors}: {data.errors.join("; ")}
              </div>
            )}
          </section>

          {data.repos.map((r) => (
            <details key={r.repo} open className="panel">
              <summary className="panel-head"><span className="panel-title">{r.repo} ({r.merged.length})</span></summary>
              <div className="panel-pad space-y-4">
                {r.merged.length === 0 && <p style={{ fontSize: 13, color: "var(--fg-faint)" }}>{PATCH_UI.noMerged}</p>}
                {r.merged.map((p) => (
                  <div key={p.number} style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 14, ...wrap }}>
                      <a className="tbl-link" href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a>
                      <span style={{ color: "var(--fg-faint)", fontSize: 12 }}> #{p.number} · {date(p.mergedAt)} · {p.author}</span>
                    </div>
                    {p.steps.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>{PATCH_UI.noSteps}</div>
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
