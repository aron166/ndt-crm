// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Two settings editors saving different keys at the same moment: both keys survive.
 * Real Postgres only; skipped unless TENANT_SETTINGS_IT_DATABASE_URL is set and local.
 * Needs only a `tenants (id int primary key, settings jsonb)` table; the test creates
 * a row with a fresh id and removes it.
 */
const CONNECTION = process.env.TENANT_SETTINGS_IT_DATABASE_URL;
const enabled = Boolean(CONNECTION && (CONNECTION.includes("127.0.0.1") || CONNECTION.includes("localhost")));

describe.skipIf(!enabled)("setTenantSettings (integration)", () => {
  let db: typeof import("@/lib/db")["db"];
  let setTenantSettings: typeof import("./tenant-settings")["setTenantSettings"];
  const id = 900000 + (Date.now() % 90000);

  beforeAll(async () => {
    process.env.DATABASE_URL = CONNECTION;
    ({ db } = await import("@/lib/db"));
    ({ setTenantSettings } = await import("./tenant-settings"));
    await db.$executeRaw`INSERT INTO tenants (id, settings) VALUES (${id}, '{"keep":1}'::jsonb)`;
  });
  afterAll(async () => {
    await db.$executeRaw`DELETE FROM tenants WHERE id = ${id}`;
  });

  it("settings stored as JSON null (not SQL NULL) is patched, not failed", async () => {
    await db.$executeRaw`UPDATE tenants SET settings = 'null'::jsonb WHERE id = ${id}`;
    await setTenantSettings(id, { a: 1, b: "x" });
    const [row] = await db.$queryRaw<{ settings: Record<string, unknown> }[]>`SELECT settings FROM tenants WHERE id = ${id}`;
    expect(row.settings).toEqual({ a: 1, b: "x" });
    await db.$executeRaw`UPDATE tenants SET settings = '{"keep":1}'::jsonb WHERE id = ${id}`;
  });

  it("interleaved writers of different keys: every key survives, the neighbour is untouched", async () => {
    for (let round = 0; round < 20; round++) {
      await Promise.all([
        setTenantSettings(id, { outreachReplyTo: `r${round}@ceg.hu`, outreachFooter: `f${round}` }),
        setTenantSettings(id, { scriptVariants: [{ key: `v${round}` }] }),
        setTenantSettings(id, { contentReviewers: [round] }),
      ]);
      const [row] = await db.$queryRaw<{ settings: Record<string, unknown> }[]>`SELECT settings FROM tenants WHERE id = ${id}`;
      expect(row.settings).toEqual({
        keep: 1, outreachReplyTo: `r${round}@ceg.hu`, outreachFooter: `f${round}`,
        scriptVariants: [{ key: `v${round}` }], contentReviewers: [round],
      });
    }
  });
});
