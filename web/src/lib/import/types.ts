import type { ImportEntity } from "./fields";

export type ImportRowStatus = "új" | "meglévő" | "kihagyva" | "hiba";

export interface ImportResult {
  entity: ImportEntity;
  dryRun: boolean;
  total: number;
  created: number; // new primary entities (companies or persons)
  matched: number; // existing → skipped, never overwritten
  skipped: number; // dissolved / unmappable
  errors: { row: number; message: string }[];
  companiesCreated: number; // incidental companies created while linking persons
  contactsCreated: number;
  sample: { row: number; status: ImportRowStatus; label: string; detail?: string }[];
}
