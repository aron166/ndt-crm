import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cfg = JSON.parse(readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8"));

// A preview of this app talks to the production database: only the production branch (dev) may build.
describe("vercel.json", () => {
  it("deploys only dev: every other branch (incl. slashed names) is off", () => {
    expect(cfg.git.deploymentEnabled).toEqual({ "**": false, dev: true });
  });
  it("keeps the cron entries", () => {
    expect(cfg.crons.map((c: { path: string }) => c.path)).toEqual([
      "/api/cron/automations", "/api/cron/content-digest", "/api/cron/weekly-report",
    ]);
  });
});
