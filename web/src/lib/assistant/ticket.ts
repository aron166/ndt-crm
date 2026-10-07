import { z } from "zod";
import { PATCH_OWNER, PATCH_REPOS, type PatchRepo } from "@/lib/patchnotes/repos";

export const TicketDraftSchema = z.object({
  title: z.string().trim().min(5).max(120),
  body: z.string().trim().min(10).max(4000),
  label: z.enum(["bug", "backlog"]),
  repo: z.enum(PATCH_REPOS),
});
export type TicketDraft = z.infer<typeof TicketDraftSchema>;

export function parseTicketDraft(text: string, defaultRepo: PatchRepo = "ndt-crm"): TicketDraft | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let o: unknown;
  try {
    o = JSON.parse(t);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = TicketDraftSchema.safeParse({ ...o, repo: (o as { repo?: unknown }).repo || defaultRepo });
  return r.success ? r.data : null;
}

export const TICKET_INSTRUCTION = [
  "A felhasználó hibát jelentene vagy fejlesztési ötletet adna le. A beszélgetés alapján készítsen jegyet.",
  'Válaszoljon KIZÁRÓLAG egyetlen JSON objektummal, más szöveg nélkül: {"title": string, "body": string, "label": "bug" | "backlog", "repo": string}.',
  `A "repo" értéke "ndt-crm", kivéve ha a felhasználó kifejezetten megnevezi a következők egyikét: ${PATCH_REPOS.join(", ")}.`,
  'A "label" legyen "bug", ha valami hibásan működik, és "backlog", ha új ötlet vagy kérés.',
  'A "title" és a "body" magyarul szóljon. A "body" tartalmazza: mi történt, mit várt volna a felhasználó, és melyik oldalon (útvonal) történt.',
].join("\n");

export function newIssueUrl(d: TicketDraft): string {
  const q = new URLSearchParams({ title: d.title, body: d.body, labels: d.label });
  return `https://github.com/${PATCH_OWNER}/${d.repo}/issues/new?${q.toString()}`;
}

export async function createGithubIssue(
  d: TicketDraft,
  opts: { token?: string; fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true; url: string } | { ok: false; fallbackUrl: string }> {
  const fallback = { ok: false as const, fallbackUrl: newIssueUrl(d) };
  const token = opts.token ?? process.env.GITHUB_TOKEN;
  if (!token) return fallback;
  try {
    const res = await (opts.fetchImpl ?? fetch)(`https://api.github.com/repos/${PATCH_OWNER}/${d.repo}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: d.title, body: d.body, labels: [d.label] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return fallback;
    const j = (await res.json()) as { html_url?: unknown };
    return typeof j.html_url === "string" ? { ok: true, url: j.html_url } : fallback;
  } catch {
    return fallback;
  }
}
