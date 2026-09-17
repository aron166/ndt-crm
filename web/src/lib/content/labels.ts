import type { ContentCategory, Verdict } from "./types";

// ⚠️ HU PROPOSALS (translating-english-to-hungarian pass) — not signed off by Áron.
// Status labels live in lib/marketing/types.ts (STATUS_LABELS).

export const CATEGORY_LABEL: Record<ContentCategory, string> = {
  script: "Szkript",
  email: "E-mail",
  ad: "Hirdetés",
  lead_magnet: "Lead magnet",
  landing: "Landing oldal",
  video: "Videó",
  image: "Kép",
  other: "Egyéb",
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  approve: "Jóváhagyta",
  changes: "Javítást kért",
  rewrite: "Újraírást kért",
};

/** The three buttons (spec §4). */
export const VERDICT_ACTION: Record<Verdict, string> = {
  approve: "Jóváhagyom",
  changes: "Javítást kérek",
  rewrite: "Írja újra",
};

export const AUTHOR_LABEL: Record<string, string> = {
  ai: "AI",
  user: "Kézi szerkesztés",
  import: "Importált",
};

export const UI = {
  inboxTitle: "Anyagok",
  mine: "Rád vár",
  otherReviewer: "A másik bírálóra vár",
  aiWorking: "Az AI dolgozik rajta",
  changesRequested: "Javításra vagy újraírásra vár",
  live: "Élő",
  library: "Élő anyagok",
  nothingForYou: "Nincs mit bírálnod.",
  notReviewer: "Nem vagy bíráló, ezért csak olvashatod.",
  noReviewers: "Nincsenek bírálók beállítva, így semmi sem kerülhet élesbe.",
  waitingDays: (n: number) => `${n} napja vár`,
  version: (n: number) => `${n}. verzió`,
  notYetReviewed: "Még nem bírálta",
  edit: "Szerkesztés",
  saveAsVersion: "Mentés új verzióként",
  resetWarning: "Mentéskor mindkét jóváhagyás elvész, és az anyag újra bírálatra kerül.",
  cancel: "Mégse",
  commentLabel: "Mi legyen másképp?",
  commentRequired: "Írd le röviden, mit kell változtatni.",
  changeNote: "Mit változtattál? (nem kötelező)",
  versions: "Verziók",
  showDiff: "Eltérések az előző verzióhoz",
  hideDiff: "Eltérések elrejtése",
  comments: "Megjegyzések",
  files: "Fájlok",
  addFile: "Fájl hozzáadása",
  addLink: "Link hozzáadása",
  removeFile: "Eltávolítás",
  copyText: "Szöveg másolása",
  copied: "Másolva",
  download: "Letöltés",
  archive: "Archiválás",
  aiBusy: "Az AI éppen átírja ezt az anyagot. Ha most szerkeszted, a te változatod marad meg.",
  needsHumanAsset: "Ehhez az anyaghoz emberi munka kell (kép vagy videó).",
  liveServes: (n: number) => `Élesben a(z) ${n}. verzió van használatban`,
  reviewers: "Bírálók",
  saveReviewers: "Bírálók mentése",
  category: "Kategória",
  campaign: "Kampány",
  format: "Formátum",
  status: "Állapot",
  all: "Összes",
  pipeline: ["Vázlat", "Jóváhagyás", "Élő", "Kampányban használva"],
  publishedLink: "Megjelenés linkje",
};
