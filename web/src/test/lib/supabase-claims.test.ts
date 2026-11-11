import { describe, expect, it } from "vitest";
import { sessionClaims } from "@/lib/supabase/claims";

const client = (getClaims: () => Promise<unknown>) => ({ auth: { getClaims } }) as never;

describe("sessionClaims", () => {
  it("returns sub and email from verified claims", async () => {
    const c = await sessionClaims(client(async () => ({ data: { claims: { sub: "u1", email: "a@b.hu" } } })));
    expect(c).toEqual({ sub: "u1", email: "a@b.hu" });
  });

  it("is null without a session", async () => {
    expect(await sessionClaims(client(async () => ({ data: null, error: { message: "no session" } })))).toBeNull();
  });

  it("is null when getClaims throws on a malformed token (a 500 before)", async () => {
    expect(await sessionClaims(client(async () => { throw new SyntaxError("bad json"); }))).toBeNull();
  });

  it("drops a non-string email and refuses claims without sub", async () => {
    expect(await sessionClaims(client(async () => ({ data: { claims: { sub: "u1", email: 42 } } })))).toEqual({ sub: "u1", email: null });
    expect(await sessionClaims(client(async () => ({ data: { claims: { email: "a@b.hu" } } })))).toBeNull();
  });
});
