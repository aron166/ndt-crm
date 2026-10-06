import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Every export of a "use server" file is callable by action id by anything that
// can POST to the deployment, regardless of which page imports it. The proxy
// session gate is NOT enough: it lets /login through for everyone. So every
// exported function must call a CRM-user guard in its own body (#114, #116,
// lane 2e audit). A new export without one fails here.
//
// Guards: getActor directly, or a local helper that wraps it under one of
// these names. Adding a name here means that helper must call getActor.
const GUARDS = ["getActor", "requireUser", "userActor", "userLeadCtx", "isCrmUser"];
const GUARD_CALL = new RegExp(`\\b(${GUARDS.join("|")})\\(`);

const ROOT = path.join(__dirname, "..", "..", "..");

function serverFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...serverFiles(p));
    else if (/\.tsx?$/.test(e.name) && /^\s*["']use server["']/.test(fs.readFileSync(p, "utf8"))) out.push(p);
  }
  return out;
}

function unguardedExports(file: string): string[] {
  const src = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const bad: string[] = [];
  const isExported = (n: ts.Node) =>
    ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const st of src.statements) {
    if (ts.isFunctionDeclaration(st) && isExported(st) && st.name) {
      if (!st.body || !GUARD_CALL.test(st.body.getText(src))) bad.push(st.name.text);
    } else if (ts.isVariableStatement(st) && isExported(st)) {
      for (const d of st.declarationList.declarations) {
        if (!d.initializer || !GUARD_CALL.test(d.initializer.getText(src))) bad.push(d.name.getText(src));
      }
    }
  }
  return bad;
}

describe("server action auth guard", () => {
  const files = serverFiles(path.join(ROOT, "src"));

  it("finds the server action files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("every exported server action calls a CRM-user guard", () => {
    const missing = files.flatMap((f) => unguardedExports(f).map((n) => `${path.relative(ROOT, f)}: ${n}`));
    expect(missing).toEqual([]);
  });
});
