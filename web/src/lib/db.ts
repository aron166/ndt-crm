import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function makeClient() {
  const connectionString = (process.env.DATABASE_URL ?? "")
    .replace("?pgbouncer=true", "")
    .replace("&pgbouncer=true", "");
  const adapter = new PrismaPg({
    connectionString,
    max: 3,                  // Supabase free tier: 15 total connections shared across all projects
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
