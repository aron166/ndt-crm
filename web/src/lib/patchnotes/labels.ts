// Patchnotes copy. PROPOSAL: Hungarian UI copy is not final until Áron
// approves it. No emojis, no dash glyphs (portfolio style law).
export const PATCH_UI = {
  title: "Patchnotes",
  doneThisWeek: "Elkészült",
  days7: "7 nap",
  days28: "28 nap",
  backlog: "Backlog",
  decisionAron: "Áron dönt",
  testOk: "Teszt OK",
  bug: "Hiba",
  notYet: "Még nem",
  noToken:
    "A GitHub token nincs beállítva (GITHUB_TOKEN). Kérd meg Áront, hogy állítsa be a Vercelen: fine-grained token, Pull requests: read, Issues: read, Metadata: read, az öt repóra.",
  noSteps: "Nincs kézi tesztlépés ebben a PR-ben.",
  noMerged: "Nincs merge-elt PR.",
  none: "Nincs.",
  errors: "Lekérési hibák",
  saveFailed: "Mentés sikertelen, próbáld újra.",
  openIssue: "Hibajegy",
  progress: (ok: number, total: number, bug: number) => `${ok}/${total} OK, ${bug} hiba`,
} as const;
