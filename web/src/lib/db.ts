import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

function makeClient() {
  const connectionString = (process.env.DATABASE_URL ?? "")
    .replace("?pgbouncer=true", "")
    .replace("&pgbouncer=true", "");

  // ponytail: 8 connections, not 3. /leads fires ~20 queries under Promise.all;
  // at max:3 they ran in 7 serialised waves. Supabase's transaction pooler holds
  // far more than 8 per instance at this scale (2 users, 1 tenant). If Vercel ever
  // fans out to enough concurrent instances to exhaust the pooler, lower this —
  // the ceiling is pooler connections / peak instances, not this number.
  const pool = new Pool({
    connectionString,
    max: 8,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
