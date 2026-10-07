import "server-only";
import { unstable_cache } from "next/cache";
import { PATCH_BASE, PATCH_OWNER, PATCH_REPOS } from "./repos";
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
export function toRepoData(repo: string, pulls: Raw[], backlog: Raw[], decision: Raw[], now: number, base?: string): RepoData {
  const merged = pulls
    .filter((p) => p.merged_at != null && (base === undefined || (p.base as Raw | undefined)?.ref === base))
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

export type Patchnotes = { configured: false } | { configured: true; repos: RepoData[]; errors: string[] };

// Cache the TRANSFORMED result, not the fetches: the raw ndt-crm pulls page is
// ~1.8 MB, at the 2 MB Data Cache item limit. 15 GitHub requests per 10 min.
// A result with errors is never cached: the wrapped fn throws it, getPatchnotes unwraps it.
class PartialResult extends Error {
  constructor(public result: Patchnotes) {
    super("partial patchnotes result");
  }
}

const cachedFetchAll = unstable_cache(
  async () => {
    const r = await fetchAll(process.env.GITHUB_TOKEN!);
    if (r.configured && r.errors.length > 0) throw new PartialResult(r);
    return r;
  },
  ["patchnotes-v1"],
  { revalidate: 600 },
);

export async function getPatchnotes(): Promise<Patchnotes> {
  if (!process.env.GITHUB_TOKEN) return { configured: false };
  // The token is read inside, never passed as an arg: args become the cache key.
  try {
    return await cachedFetchAll();
  } catch (e) {
    if (e instanceof PartialResult) return e.result;
    throw e;
  }
}

async function fetchAll(token: string): Promise<Patchnotes> {
  const errors: string[] = [];
  const get = async (repo: string, path: string): Promise<Raw[]> => {
    try {
      const res = await fetch(`https://api.github.com/repos/${PATCH_OWNER}/${repo}/${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
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
        // created sort: older merges do not drop out when other PRs get updated.
        // Ceiling 100 closed PRs per repo in the window; paginate if a repo exceeds that in 28 days.
        get(repo, `pulls?state=closed&base=${PATCH_BASE[repo]}&sort=created&direction=desc&per_page=100`),
        get(repo, "issues?state=open&labels=backlog&per_page=50"),
        get(repo, "issues?state=open&labels=decision-aron&per_page=50"),
      ]);
      return toRepoData(repo, pulls, backlog, decision, Date.now(), PATCH_BASE[repo]);
    }),
  );
  return { configured: true, repos, errors };
}
