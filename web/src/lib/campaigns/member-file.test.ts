import { describe, it, expect } from "vitest";
import { parseMemberFile } from "./member-file";
import { memberRowSchema } from "./members";

// Synthetic rows only: no real contact data in this repo.
describe("parseMemberFile", () => {
  it("maps builder rows like the loader script, drops crm_lost, keeps wire rows as they are", () => {
    const r = parseMemberFile(JSON.stringify([
      { company: "Minta Kft.", crm_name: "", vat8: 12345678, email: "a@minta.example.test", rank: 4, owner: "Péter call" },
      { company: "Elveszett Kft.", crm_name: "", crm_lost: true },
    ]));
    if ("error" in r) throw new Error(r.error);
    expect(r.rows).toHaveLength(1);
    expect(memberRowSchema.parse(r.rows[0])).toMatchObject({ company_name: "Minta Kft.", vat: "12345678", priority: 4 });
    expect(r.rows[0]).not.toHaveProperty("phone_only");
    const w = parseMemberFile(JSON.stringify({ rows: [{ company_name: "Wire Kft.", phone: "1" }] }));
    expect(w).toEqual({ rows: [{ company_name: "Wire Kft.", phone: "1" }] });
  });
  it("refuses what is not a row list", () => {
    expect(parseMemberFile("nope")).toHaveProperty("error");
    expect(parseMemberFile("{}")).toHaveProperty("error");
    expect(parseMemberFile("[]")).toHaveProperty("error");
  });
});
