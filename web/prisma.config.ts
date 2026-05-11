import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'

config({ path: path.join(process.cwd(), '.env') })

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  // CLI commands (migrate, introspect) use session-mode pooler — IPv4-reachable.
  // Prisma Client at runtime reads DATABASE_URL (transaction mode) from env directly.
  datasource: {
    url: process.env.DIRECT_URL,
  },
})
