// The repositories /patchnotes reads. The fine-grained GITHUB_TOKEN must cover
// exactly these (Pull requests: read, Issues: read, Metadata: read).
export const PATCH_OWNER = "aron166";
export const PATCH_REPOS = ["ndt-crm", "betonscan-landing", "growth", "workspace", "peterdrive"] as const;
export type PatchRepo = (typeof PATCH_REPOS)[number];

export function isPatchRepo(r: unknown): r is PatchRepo {
  return typeof r === "string" && (PATCH_REPOS as readonly string[]).includes(r);
}

export type PatchState = "ok" | "bug";

// Only PRs merged into the integration branch count (excludes feature-into-feature
// PRs and dev to main promotions).
export const PATCH_BASE: Record<PatchRepo, string> = { "ndt-crm": "dev", "betonscan-landing": "main", growth: "dev", workspace: "main", peterdrive: "dev" };
