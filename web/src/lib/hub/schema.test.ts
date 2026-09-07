import { describe, it, expect } from "vitest";
import {
  appEventSchema,
  conversationIntakeSchema,
  MAX_MESSAGES,
  MAX_PAYLOAD_BYTES,
} from "./schema";

describe("appEventSchema", () => {
  const valid = {
    eventType: "lead.submitted",
    payload: { foo: "bar" },
  };

  it("accepts a minimal valid payload and trims strings", () => {
    const r = appEventSchema.safeParse({ ...valid, eventType: "  quote.created  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.eventType).toBe("quote.created");
  });

  it("accepts optional FK ids as positive integers", () => {
    const r = appEventSchema.safeParse({
      ...valid,
      agentId: 2,
      personId: 3,
      companyId: 4,
    });
    expect(r.success).toBe(true);
  });

  it("ignores body tenantId / sourceApp (both come from the app key)", () => {
    const r = appEventSchema.safeParse({ ...valid, tenantId: 99, sourceApp: "spoof" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("sourceApp");
    if (r.success) expect(r.data).not.toHaveProperty("tenantId");
  });

  it("rejects missing eventType or payload", () => {
    expect(appEventSchema.safeParse({ payload: {} }).success).toBe(false);
    expect(appEventSchema.safeParse({ eventType: "y" }).success).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(appEventSchema.safeParse({ ...valid, payload: "str" }).success).toBe(false);
    expect(appEventSchema.safeParse({ ...valid, payload: [1, 2] }).success).toBe(false);
  });

  it("rejects non-positive or non-integer ids", () => {
    expect(appEventSchema.safeParse({ ...valid, agentId: -1 }).success).toBe(false);
    expect(appEventSchema.safeParse({ ...valid, companyId: 1.5 }).success).toBe(false);
  });

  it("rejects overlong eventType", () => {
    expect(
      appEventSchema.safeParse({ ...valid, eventType: "x".repeat(129) }).success,
    ).toBe(false);
  });

  it("rejects a payload over the byte cap", () => {
    const r = appEventSchema.safeParse({
      ...valid,
      payload: { blob: "x".repeat(MAX_PAYLOAD_BYTES) },
    });
    expect(r.success).toBe(false);
  });

  it("counts UTF-8 bytes, not UTF-16 code units (multibyte content)", () => {
    // 9000 emoji ≈ 18k UTF-16 code units (under the cap) but ≈ 36k UTF-8 bytes.
    const blob = "😀".repeat(9000);
    expect(JSON.stringify({ blob }).length).toBeLessThan(MAX_PAYLOAD_BYTES);
    expect(appEventSchema.safeParse({ ...valid, payload: { blob } }).success).toBe(false);
  });
});

describe("conversationIntakeSchema", () => {
  const valid = { channel: "web_chat" };

  it("accepts a minimal valid payload", () => {
    expect(conversationIntakeSchema.safeParse(valid).success).toBe(true);
  });

  it("coerces endedAt to a Date and rejects garbage", () => {
    const ok = conversationIntakeSchema.safeParse({
      ...valid,
      endedAt: "2026-06-10T12:00:00Z",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.endedAt).toBeInstanceOf(Date);

    expect(
      conversationIntakeSchema.safeParse({ ...valid, endedAt: "not-a-date" }).success,
    ).toBe(false);
  });

  it("accepts messages and rejects empty role/content", () => {
    const ok = conversationIntakeSchema.safeParse({
      ...valid,
      messages: [{ role: "user", content: "hello" }],
    });
    expect(ok.success).toBe(true);

    expect(
      conversationIntakeSchema.safeParse({
        ...valid,
        messages: [{ role: "", content: "hello" }],
      }).success,
    ).toBe(false);
    expect(
      conversationIntakeSchema.safeParse({
        ...valid,
        messages: [{ role: "user", content: "" }],
      }).success,
    ).toBe(false);
  });

  it("caps the message count", () => {
    const messages = Array.from({ length: MAX_MESSAGES + 1 }, () => ({
      role: "user",
      content: "x",
    }));
    expect(conversationIntakeSchema.safeParse({ ...valid, messages }).success).toBe(false);
  });

  it("caps total message bytes", () => {
    const messages = [
      { role: "user", content: "x".repeat(16_000) },
      { role: "user", content: "y".repeat(16_000) },
      { role: "user", content: "z".repeat(16_000) },
    ];
    expect(conversationIntakeSchema.safeParse({ ...valid, messages }).success).toBe(false);
  });

  it("rejects a missing or blank channel", () => {
    expect(conversationIntakeSchema.safeParse({}).success).toBe(false);
    expect(conversationIntakeSchema.safeParse({ channel: "  " }).success).toBe(false);
  });
});
