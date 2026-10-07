import "server-only";
import { PATCH_OWNER, PATCH_REPOS } from "./repos";
import { parseManualTest } from "./parse";

export type Issue = { number: number; title: string; url: string };
export type MergedPr = { number: number; title: string; url: string; mergedAt: string; author: string; steps: string[] };
export type RepoData = { repo: string; merged: MergedPr[]; merged7: number; merged28: number; backlog: Issue[]; decisionAron: Issue[] };

type Raw = Record<string, unknown>;
const DAY = 86_400_000;
const SHOWN = 30;

const toIssues = (items: Raw[]): Issue[] =>
  items.filter((i) => !("pull_request" in i)).map((i) => ({ number: i.number as number, title: i.title as string, url: i.html_url as string }));

/** Pure transform of raw GitHub JSON into one repo's view. */
export function toRepoData(repo: string, pulls: Raw[], backlog: Raw[], decision: Raw[], now: number): RepoData {
  const merged = pulls
    .filter((p) => p.merged_at != null)
    .map((p) => ({
      number: p.number as number,
      title: p.title as string,
      url: p.html_url as string,
      mergedAt: p.merged_at as string,
      author: ((p.user as Raw | null)?.login as string | undefined) ?? "",
      steps: parseManualTest((p.body as string | null) ?? null),
    }))
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
  const within = (d: number) => merged.filter((p) => now - Date.parse(p.mergedAt) <= d * DAY).length;
  return { repo, merged: merged.slice(0, SHOWN), merged7: within(7), merged28: within(28), backlog: toIssues(backlog), decisionAron: toIssues(decision) };
}

export async function getPatchnotes(): Promise<{ configured: false } | { configured: true; repos: RepoData[]; errors: string[] }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { configured: false };
  const errors: string[] = [];
  const get = async (repo: string, path: string): Promise<Raw[]> => {
    try {
      const res = await fetch(`https://api.github.com/repos/${PATCH_OWNER}/${repo}/${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        next: { revalidate: 600 },
      });
      if (!res.ok) {
        errors.push(`${repo}: HTTP ${res.status}`);
        return [];
      }
      return (await res.json()) as Raw[];
    } catch {
      errors.push(`${repo}: request failed`);
      return [];
    }
  };
  const repos = await Promise.all(
    PATCH_REPOS.map(async (repo) => {
      const [pulls, backlog, decision] = await Promise.all([
        get(repo, "pulls?state=closed&sort=updated&direction=desc&per_page=100"),
        get(repo, "issues?state=open&labels=backlog&per_page=50"),
        get(repo, "issues?state=open&labels=decision-aron&per_page=50"),
      ]);
      return toRepoData(repo, pulls, backlog, decision, Date.now());
    }),
  );
  return { configured: true, repos, errors };
}
