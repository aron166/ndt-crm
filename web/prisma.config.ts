import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'

// What the SHELL set, captured BEFORE .env is loaded. `.env` in this repo is
// PRODUCTION, and dotenv never overrides a variable already in the environment,
// so this is the only way to tell "the caller asked for this database" apart
// from "the caller said nothing and got production".
const shellDirect = process.env.DIRECT_URL
const shellDatabase = process.env.DATABASE_URL

config({ path: path.join(process.cwd(), '.env') })

const isLocal = (url?: string) =>
  Boolean(url && (url.includes('127.0.0.1') || url.includes('localhost')))

// The incident this guard exists for (2026-09-18): the CLI reads DIRECT_URL,
// so `DATABASE_URL=<local> npx prisma migrate deploy` silently applied an
// unreleased migration to PRODUCTION. Overriding one of the two is always a
// mistake, and a mistake that is invisible until you go looking at prod.
if (!shellDirect && isLocal(shellDatabase) && !isLocal(process.env.DIRECT_URL)) {
  throw new Error(
    'Refusing to run: DATABASE_URL points at a local database but DIRECT_URL comes from .env ' +
      '(production), and the Prisma CLI uses DIRECT_URL. Pass BOTH:\n' +
      '  DIRECT_URL=<local> DATABASE_URL=<local> npx prisma <command>',
  )
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  // CLI commands (migrate, introspect) use session-mode pooler - IPv4-reachable.
  // Prisma Client at runtime reads DATABASE_URL (transaction mode) from env directly.
  datasource: {
    url: process.env.DIRECT_URL,
  },
})
