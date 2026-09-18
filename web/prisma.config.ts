import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'
import { refusalReason } from './prisma-guard.mjs'

// Captured BEFORE .env is loaded: dotenv never overrides a variable already in
// the environment, so this is the only way to tell "the caller named a
// database" apart from "the caller said nothing and got production".
const shellDatabaseUrl = process.env.DATABASE_URL

config({ path: path.join(import.meta.dirname, '.env') })

const refusal = refusalReason(shellDatabaseUrl, process.env.DIRECT_URL, process.argv)
if (refusal) throw new Error(refusal)

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  // CLI commands (migrate, introspect) use session-mode pooler — IPv4-reachable.
  // Prisma Client at runtime reads DATABASE_URL (transaction mode) from env directly.
  datasource: {
    url: process.env.DIRECT_URL,
  },
})
