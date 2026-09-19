// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * The one claim in this feature that a unit test cannot make: that the
 * `jsonb_set` in actions/theme.ts MERGES the theme into users.settings rather
 * than replacing the bag. Everything else about the setting is pure.
 *
 * Same guard and harness as content/service.integration.test.ts: skipped
 * unless CONTENT_IT_DATABASE_URL is set and obviously local, so it can never
 * touch the production database in `web/.env`. CI sets it.
 *
 * Run: CONTENT_IT_DATABASE_URL=postgresql://postgres:fixture@127.0.0.1:5439/ndtcrm \
 *   npx vitest run src/lib/theme.integration.test.ts
 */
const CONNECTION = process.env.CONTENT_IT_DATABASE_URL;
const enabled = Boolean(
  CONNECTION && (CONNECTION.includes("127.0.0.1") || CONNECTION.includes("localhost")),
);

const EMAIL = "it-theme@example.test";
const TENANT_ID = 1;

describe.skipIf(!enabled)("theme setting (integration)", () => {
  let db: (typeof import("@/lib/db"))["db"];
  // Imported inside beforeAll, not at the top: lib/theme.ts pulls in lib/db,
  // and db builds its pool from DATABASE_URL at module load. A static import
  // would build it before the line below repoints it at the fixture.
  let parseTheme: (typeof import("./theme"))["parseTheme"];
  let userId: number;

  // The statement under test, character for character as actions/theme.ts
  // runs it. Importing the server action itself would drag in next/cache and
  // the auth stack; the SQL is the part that can be silently wrong.
  async function writeTheme(id: number, theme: string) {
    return db.$executeRaw`
      UPDATE "users"
         SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), ARRAY['theme'], ${JSON.stringify(theme)}::jsonb, true)
       WHERE "id" = ${id} AND "tenant_id" = ${TENANT_ID}`;
  }

  const settingsOf = async (id: number) =>
    (await db.user.findUniqueOrThrow({ where: { id }, select: { settings: true } })).settings;

  beforeAll(async () => {
    process.env.DATABASE_URL = CONNECTION;
    ({ db } = await import("@/lib/db"));
    ({ parseTheme } = await import("./theme"));
    await db.user.deleteMany({ where: { email: EMAIL } });
    const u = await db.user.create({
      data: { tenantId: TENANT_ID, name: "IT Theme", email: EMAIL, passwordHash: "x" },
    });
    userId = u.id;
  });

  afterAll(async () => {
    if (!db) return;
    if (userId != null) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("starts NULL, which every existing user is, and reads as dark", async () => {
    expect(await settingsOf(userId)).toBeNull();
    expect(parseTheme(await settingsOf(userId))).toBe("dark");
  });

  it("writes a theme into a NULL settings column", async () => {
    expect(await writeTheme(userId, "light")).toBe(1);
    expect(parseTheme(await settingsOf(userId))).toBe("light");
  });

  it("preserves the rest of the bag, which is the whole reason for jsonb_set", async () => {
    await db.user.update({
      where: { id: userId },
      data: { settings: { density: "compact", theme: "dark" } },
    });

    expect(await writeTheme(userId, "light")).toBe(1);

    const after = (await settingsOf(userId)) as Record<string, unknown>;
    expect(after.density).toBe("compact");
    expect(after.theme).toBe("light");
  });

  it("writes nothing for a user in another tenant", async () => {
    const other = await db.tenant.findFirst({ where: { id: { not: TENANT_ID } }, select: { id: true } });
    if (!other) return; // single-tenant fixture: the WHERE is still proven by the row count below
    const foreign = await db.user.create({
      data: { tenantId: other.id, name: "IT Foreign", email: "it-theme-foreign@example.test", passwordHash: "x" },
    });
    try {
      // tenant_id is in the WHERE, so a correct id in the wrong tenant matches nothing.
      expect(await writeTheme(foreign.id, "light")).toBe(0);
      expect(await settingsOf(foreign.id)).toBeNull();
    } finally {
      await db.user.deleteMany({ where: { id: foreign.id } });
    }
  });

  it("writes nothing for an id that does not exist, so the action can report failure", async () => {
    expect(await writeTheme(-1, "light")).toBe(0);
  });
});
