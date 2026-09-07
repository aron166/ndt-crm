import { describe, it, expect, vi } from "vitest";
vi.mock("./db", () => ({ db: {} }));
vi.mock("./supabase/server", () => ({ createClient: vi.fn() }));
import { normalizeEmail } from "./actor";

describe("normalizeEmail", () => {
  it("gmail: case, dots and +tags collapse to one mailbox", () => {
    expect(normalizeEmail(" Balogh.Aron16+crm@Gmail.com ")).toBe("balogharon16@gmail.com");
    expect(normalizeEmail("balogharon16@googlemail.com")).toBe("balogharon16@gmail.com");
  });
  it("non-gmail keeps dots, only trims + lowercases", () => {
    expect(normalizeEmail("Peter.Nagy@Controllabor.hu ")).toBe("peter.nagy@controllabor.hu");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});
