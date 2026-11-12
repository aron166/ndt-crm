// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { simpleParser } from "mailparser";
import { classifyMail } from "./classify";

const OURS = ["ndt.hu"];
async function run(name: string) {
  const raw = readFileSync(path.join(__dirname, "fixtures", name));
  return classifyMail(await simpleParser(raw), raw, OURS);
}

describe("classifyMail", () => {
  it("plain reply: kind reply, from, In-Reply-To ids, snippet", async () => {
    const r = await run("plain-reply.eml");
    expect(r).toMatchObject({ kind: "reply", messageId: "<plain-1@mail.pelda-kft.hu>", from: "anna@pelda-kft.hu" });
    if (r.kind !== "reply") throw new Error();
    expect(r.inReplyTo).toContain("<sent-1@resend.example>");
    expect(r.snippet).toBe("Érdekel, hívjanak a 30 123 4567-es számon.");
  });

  it("a quoted footer with 'leiratkozás' is a reply, not an opt-out; the quote is cut", async () => {
    const r = await run("quoted-reply.eml");
    expect(r.kind).toBe("reply");
    if (r.kind !== "reply") throw new Error();
    expect(r.snippet).toBe("Kedves Aron, kuldje el az anyagot.");
  });

  it("html-only reply is cut at gmail_quote", async () => {
    const r = await run("html-reply.eml");
    expect(r.kind).toBe("reply");
    if (r.kind !== "reply") throw new Error();
    expect(r.snippet).toContain("szívesen egyeztetnék");
    expect(r.snippet).not.toContain("leiratkoz");
  });

  it("out-of-office by header and by subject alone are auto", async () => {
    expect((await run("out-of-office.eml")).kind).toBe("auto");
    expect((await run("ooo-subject-only.eml")).kind).toBe("auto");
  });

  it("DSN is a bounce with the failed recipient", async () => {
    expect(await run("bounce-dsn.eml")).toMatchObject({ kind: "bounce", recipient: "dead@pelda-kft.hu" });
  });

  it("a delayed DSN (Action delayed, Status 4.x.x) is auto, never a bounce (Vanda #203-2)", async () => {
    expect((await run("bounce-delay.eml")).kind).toBe("auto");
  });

  it("a forged bounce from a stranger with X-Failed-Recipients and no 5.x.x status is not a bounce (Vanda #203-2)", async () => {
    expect((await run("bounce-forged.eml")).kind).not.toBe("bounce");
  });

  it("read receipt is auto, not a bounce", async () => {
    expect((await run("read-receipt.eml")).kind).toBe("auto");
  });

  it("explicit opt-out in own text", async () => {
    expect(await run("opt-out.eml")).toMatchObject({ kind: "opt_out", from: "anna@pelda-kft.hu" });
  });

  it("RFC 2047 headers and quoted-printable body decode", async () => {
    const r = await run("accents-headers.eml");
    expect(r).toMatchObject({ kind: "reply", from: "odon@accent-kft.hu" });
    if (r.kind !== "reply") throw new Error();
    expect(r.snippet).toContain("érdekel az ajánlat");
  });

  it("mail from our own domain is ignored", async () => {
    expect(await run("from-ourselves.eml")).toMatchObject({ kind: "ignore", reason: "own_domain" });
  });

  it("no Message-ID falls back to sha256 hex of the raw bytes", async () => {
    const raw = Buffer.from("From: a@b.hu\r\nSubject: x\r\n\r\nhi\r\n");
    const r = classifyMail(await simpleParser(raw), raw, OURS);
    expect(r.messageId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a newsletter (List-Id, List-Unsubscribe, Precedence bulk) is ignored, never a reply or an opt-out (Nate review of E)", async () => {
    expect(await run("newsletter.eml")).toMatchObject({ kind: "ignore", reason: "bulk" });
  });
  it("no From is ignored", async () => {
    const raw = Buffer.from("Message-ID: <x@y>\r\nSubject: x\r\n\r\nhi\r\n");
    expect(classifyMail(await simpleParser(raw), raw, OURS)).toMatchObject({ kind: "ignore", reason: "no_from" });
  });
});
