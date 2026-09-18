import { describe, it, expect } from "vitest";
// Plain .mjs helper, shared with prisma.config.ts so both use the same rule.
import { hostOf, refusalReason } from "./prisma-guard.mjs";

const PROD = "postgresql://u:p@aws-1-eu-central-1.pooler.supabase.com:5432/postgres";
const LOCAL = "postgresql://postgres:fixture@127.0.0.1:5439/ndtcrm";
const LOCAL_OTHER_PORT = "postgresql://postgres:fixture@127.0.0.1:5432/ndt_crm";
const STAGING = "postgresql://u:p@staging.example.com:5432/x";
const DOCKER = "postgresql://u:p@host.docker.internal:5432/x";

const migrate = ["node", "prisma", "migrate", "deploy"];
const generate = ["node", "prisma", "generate"];

describe("hostOf", () => {
  it("strips credentials, port and path", () => {
    expect(hostOf(LOCAL)).toBe("127.0.0.1");
    expect(hostOf(PROD)).toBe("aws-1-eu-central-1.pooler.supabase.com");
  });
  it("is null for nothing", () => {
    expect(hostOf(undefined)).toBeNull();
  });
});

describe("refusalReason", () => {
  it("REFUSES the incident: a local DATABASE_URL against a production DIRECT_URL", () => {
    expect(refusalReason(LOCAL, PROD, migrate)).toContain("Refusing to run");
  });

  it("REFUSES staging and Docker hosts too, not just localhost", () => {
    expect(refusalReason(STAGING, PROD, migrate)).toContain("Refusing to run");
    expect(refusalReason(DOCKER, PROD, migrate)).toContain("Refusing to run");
  });

  it("REFUSES the reverse: a production DATABASE_URL against a local DIRECT_URL", () => {
    expect(refusalReason(PROD, LOCAL, migrate)).toContain("Refusing to run");
  });

  it("allows both pointing at the same host, whatever the port or database", () => {
    expect(refusalReason(LOCAL, LOCAL_OTHER_PORT, migrate)).toBeNull();
    expect(refusalReason(PROD, PROD, migrate)).toBeNull();
  });

  it("allows the normal production run: the shell named nothing", () => {
    expect(refusalReason(undefined, PROD, migrate)).toBeNull();
  });

  it("never blocks a command that does not touch a schema", () => {
    // `prisma generate` opens no connection, and `npm run build` runs it. A
    // guard that breaks the build is worse than the bug (Vanda, #106).
    expect(refusalReason(LOCAL, PROD, generate)).toBeNull();
  });

  it("covers `db` subcommands, not only `migrate`", () => {
    expect(refusalReason(LOCAL, PROD, ["node", "prisma", "db", "push"])).toContain("Refusing");
  });
});
