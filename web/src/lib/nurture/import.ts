// Pure parser for nurture email drafts (docs/birdsview/content/drafts/NN-email.md). No DB, no IO.
export type ParsedDraft = {
  key: string;
  subject: string;
  preview: string;
  bodyMd: string;
  requiresAsset: string | null;
};

export function parseDraft(fileName: string, text: string): ParsedDraft | { error: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let rest = lines;
  let front = "";
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end > 0) {
      front = lines.slice(1, end).join("\n");
      rest = lines.slice(end + 1);
    }
  }
  const topic = /\(topic #(\d+)\)/.exec(front);
  if (!topic) return { error: `${fileName}: no "(topic #N)" in frontmatter sources` };
  const key = `topic-${topic[1].padStart(2, "0")}`;

  const subjectIdx = rest.findIndex((l) => l.startsWith("**Tárgy:**"));
  const previewIdx = rest.findIndex((l) => l.startsWith("**Előnézet:**"));
  const subject = subjectIdx < 0 ? "" : rest[subjectIdx].slice("**Tárgy:**".length).trim();
  const preview = previewIdx < 0 ? "" : rest[previewIdx].slice("**Előnézet:**".length).trim();
  if (!subject) return { error: `${fileName}: missing **Tárgy:**` };
  if (!preview) return { error: `${fileName}: missing **Előnézet:**` };

  const after = Math.max(subjectIdx, previewIdx);
  const sep = rest.findIndex((l, i) => i > after && l.trim() === "---");
  if (sep < 0) return { error: `${fileName}: no "---" after Tárgy/Előnézet` };
  const bodyMd = rest.slice(sep + 1).join("\n").trim();
  if (!bodyMd) return { error: `${fileName}: empty body` };

  const requiresAsset = /videó|\[VIDEO/i.test(bodyMd) ? "summary-video" : null;
  return { key, subject, preview, bodyMd, requiresAsset };
}
