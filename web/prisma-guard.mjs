/**
 * The Prisma CLI reads DIRECT_URL, never DATABASE_URL. `web/.env` is
 * PRODUCTION. So `DATABASE_URL=<somewhere else> npx prisma migrate deploy`
 * looks redirected and is not: on 2026-09-18 it applied an unreleased
 * migration to the live database and reported success.
 *
 * Pure on purpose: the decision is a truth table, and a truth table deserves a
 * test rather than a spawned CLI (Vanda, #106).
 */

/** The host of a connection URL, port and path stripped. */
export function hostOf(url) {
  return url ? (url.match(/@([^/:?]+)/)?.[1] ?? null) : null;
}

/** Subcommands that actually touch a database schema. `generate` does not. */
const SCHEMA_COMMANDS = ["migrate", "db"];

/**
 * Why this run must be refused, or null to let it through.
 *
 * @param shellDatabaseUrl DATABASE_URL as the SHELL set it, captured BEFORE
 *   dotenv loads `.env`. Undefined means the caller named no database, so
 *   there is nothing to disagree with.
 * @param directUrl the URL the CLI will actually use.
 * @param argv the CLI argv.
 */
export function refusalReason(shellDatabaseUrl, directUrl, argv) {
  if (!shellDatabaseUrl) return null;
  if (!argv.some((a) => SCHEMA_COMMANDS.includes(a))) return null;
  const asked = hostOf(shellDatabaseUrl);
  const actual = hostOf(directUrl);
  if (asked === actual) return null;
  return (
    `Refusing to run: you set DATABASE_URL to ${asked ?? "an unparseable URL"}, but the Prisma ` +
    `CLI uses DIRECT_URL, which points at ${actual ?? "nothing"}. Overriding one of the two is ` +
    "always a mistake and it is invisible until you go looking at production. Pass BOTH:\n" +
    "  DIRECT_URL=<url> DATABASE_URL=<url> npx prisma <command>"
  );
}
