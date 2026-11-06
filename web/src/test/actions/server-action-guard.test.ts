import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Every export of a "use server" file is callable by action id by anything that
// can POST to the deployment, whichever page imports it. The proxy session gate
// is one layer; this is the second. Rule, checked on the AST (not text, so a
// guard name in a comment, a string or a nested function does not count):
// the FIRST statement of every exported function must await a guard call, e.g.
//   const denied = await requireCrmUser(TENANT_ID);
// Guards: the lib/actor.ts gates below, plus a file-local wrapper only when its
// own first statement awaits one of them (checked, not trusted by name).
const LIB_GUARDS = new Set(["requireCrmUser", "requireCrmUserId", "getActor", "userLeadCtx"]);

const ROOT = path.join(__dirname, "..", "..", "..");

function hasUseServerDirective(sf: ts.SourceFile): boolean {
  const first = sf.statements[0];
  return !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use server";
}

function sourceFiles(dir: string): ts.SourceFile[] {
  const out: ts.SourceFile[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      const sf = ts.createSourceFile(p, fs.readFileSync(p, "utf8"), ts.ScriptTarget.Latest, true);
      if (hasUseServerDirective(sf)) out.push(sf);
    }
  }
  return out;
}

function isAwaitedGuard(expr: ts.Expression | undefined, guards: Set<string>): boolean {
  while (expr && (ts.isParenthesizedExpression(expr) || (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken))) {
    expr = ts.isParenthesizedExpression(expr) ? expr.expression : expr.operand;
  }
  if (!expr || !ts.isAwaitExpression(expr)) return false;
  const call = expr.expression;
  return ts.isCallExpression(call) && ts.isIdentifier(call.expression) && guards.has(call.expression.text);
}

/** `const x = await guard(...)`, `await guard(...)`, or `if (!(await guard())) return ...`. */
function isGuardStatement(st: ts.Statement | undefined, guards: Set<string>): boolean {
  if (!st) return false;
  if (ts.isVariableStatement(st) && st.declarationList.declarations.length === 1) return isAwaitedGuard(st.declarationList.declarations[0].initializer, guards);
  if (ts.isExpressionStatement(st)) return isAwaitedGuard(st.expression, guards);
  if (ts.isIfStatement(st)) return isAwaitedGuard(st.expression, guards);
  return false;
}

function firstStatement(body: ts.ConciseBody | undefined): ts.Statement | undefined {
  return body && ts.isBlock(body) ? body.statements[0] : undefined;
}

const hasExport = (n: ts.Node) =>
  ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

function violations(sf: ts.SourceFile): string[] {
  const guards = new Set(LIB_GUARDS);
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && !hasExport(st) && st.name && isGuardStatement(firstStatement(st.body), LIB_GUARDS)) guards.add(st.name.text);
  }
  const bad: string[] = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && hasExport(st)) {
      if (!isGuardStatement(firstStatement(st.body), guards)) bad.push(st.name?.text ?? "default");
    } else if (ts.isVariableStatement(st) && hasExport(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer;
        const fn = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init : undefined;
        if (!fn || !isGuardStatement(firstStatement(fn.body), guards)) bad.push(d.name.getText(sf));
      }
    } else if (ts.isExportDeclaration(st) && !st.isTypeOnly) {
      // `export { x }` / `export * from`: cannot be checked here, so not allowed.
      bad.push(`re-export: ${st.getText(sf)}`);
    } else if (ts.isExportAssignment(st)) {
      bad.push("export default expression");
    }
  }
  return bad;
}

describe("server action auth guard", () => {
  const files = sourceFiles(path.join(ROOT, "src"));

  it("finds the server action files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("every exported server action awaits a CRM-user guard as its first statement", () => {
    const missing = files.flatMap((sf) => violations(sf).map((n) => `${path.relative(ROOT, sf.fileName)}: ${n}`));
    expect(missing).toEqual([]);
  });

  it("rejects the ways a text match was fooled", () => {
    const src = (body: string) =>
      violations(ts.createSourceFile("x.ts", `"use server";\n${body}`, ts.ScriptTarget.Latest, true));
    expect(src(`export async function a() { // requireCrmUser(1)\n return 1; }`)).toEqual(["a"]);
    expect(src(`export async function a() { const s = "requireCrmUser("; return s; }`)).toEqual(["a"]);
    expect(src(`export async function a() { await db.x(); const d = await requireCrmUser(1); }`)).toEqual(["a"]);
    expect(src(`export async function a() { const f = async () => await requireCrmUser(1); }`)).toEqual(["a"]);
    expect(src(`export const a = async () => { return 1; };`)).toEqual(["a"]);
    expect(src(`async function b() {}\nexport { b };`)).toEqual(["re-export: export { b };"]);
    expect(src(`export async function a() { const d = await requireCrmUser(1); if (d) return; }`)).toEqual([]);
    expect(src(`async function me() { const m = await requireCrmUserId(1); return m; }\nexport async function a() { if (!(await me())) return null; return 1; }`)).toEqual([]);
    expect(src(`async function me() { return true; }\nexport async function a() { if (!(await me())) return null; return 1; }`)).toEqual(["a"]);
    expect(src(`export async function a() { if (!(await requireUser())) return null; return 1; }`)).toEqual(["a"]);
    expect(src(`export async function a() { if (x) await requireCrmUser(1); }`)).toEqual(["a"]);
  });
});
