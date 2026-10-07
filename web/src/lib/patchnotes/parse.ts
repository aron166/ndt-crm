import { PATCH_OWNER } from "./repos";

const HEADING = /^#{2,3}\s*manual test\s*$/i;
const ITEM = /^\s*(?:\d+[.)]|[-*])\s+(.*)$/;

/** Steps from the "Manual test" section of a PR body. Client-safe (no server imports). */
export function parseManualTest(body: string | null): string[] {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => HEADING.test(l.trim()));
  if (start < 0) return [];
  const steps: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trimStart().startsWith("#")) break;
    const m = ITEM.exec(line);
    if (m) {
      steps.push(m[1].replace(/^\[[ xX]\]\s*/, "").trim());
    } else if (/^\s+\S/.test(line) && steps.length > 0) {
      steps[steps.length - 1] = `${steps[steps.length - 1]} ${line.trim()}`;
    }
  }
  return steps.filter((s) => s !== "");
}

/** Prefilled "new bug issue" link for one failed manual-test step. */
export function bugIssueUrl(repo: string, prNumber: number, prTitle: string, stepText: string): string {
  const short = stepText.length > 80 ? stepText.slice(0, 80) : stepText;
  const prUrl = `https://github.com/${PATCH_OWNER}/${repo}/pull/${prNumber}`;
  const q = new URLSearchParams({
    title: `Bug: PR #${prNumber} step: ${short}`,
    body: `PR: ${prUrl} (${prTitle})\n\nStep: ${stepText}\n\nExpected:\n\nActual:\n`,
    labels: "bug",
  });
  return `https://github.com/${PATCH_OWNER}/${repo}/issues/new?${q.toString()}`;
}
