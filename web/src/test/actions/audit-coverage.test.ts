import { describe, it, expect, vi, beforeEach } from "vitest";

// Action-level audit-coverage tests. The goal is to lock the audit invariant:
// each mutation type must produce exactly one audit row with the correct
// entityType + action, so the gaps found via graphify cannot silently return.
//
// We mock the audit module (assert the call), the db (return minimal rows),
// next/cache (revalidatePath is a no-op here), and crypto (deterministic).

// Hoisted so the mock objects exist before the (hoisted) vi.mock factories run.
const { audit, db } = vi.hoisted(() => ({
  audit: vi.fn(),
  db: {
    deal: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    integrationCredential: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    pipelineCustomField: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tag: { upsert: vi.fn() },
    tagging: { upsert: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({ audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encrypt: (v: string) => `enc(${v})` }));
vi.mock("@/lib/db", () => ({ db }));

import { createDeal, updateDeal, deleteDeal } from "@/app/actions/deals";
import { saveIntegrationCredential, disconnectIntegration } from "@/app/actions/integrations";
import { upsertCustomField, deleteCustomField } from "@/app/actions/custom-fields";
import { addTag, removeTag } from "@/app/actions/tags";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => {
  audit.mockReset();
  Object.values(db).forEach((model) =>
    Object.values(model).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset())
  );
});

describe("deals audit coverage", () => {
  it("createDeal logs a 'deal' create (not 'task')", async () => {
    db.deal.aggregate.mockResolvedValue({ _max: { position: null } });
    db.deal.create.mockResolvedValue({ id: 10, stageId: 2 });

    await createDeal(fd({ title: "ACME audit", companyId: "1", stageId: "2" }));

    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toBe("deal");
    expect(audit.mock.calls[0][2]).toBe("create");
  });

  it("updateDeal logs a 'deal' update", async () => {
    db.deal.findFirst.mockResolvedValue({ title: "old", stageId: 1, value: null, customFields: null });
    db.deal.updateMany.mockResolvedValue({ count: 1 });

    await updateDeal(10, fd({ title: "new" }));

    expect(audit.mock.calls[0][0]).toBe("deal");
    expect(audit.mock.calls[0][2]).toBe("update");
  });

  it("deleteDeal logs a 'deal' delete", async () => {
    db.deal.findFirst.mockResolvedValue({ title: "x", stageId: 1, value: 5, companyId: 1 });
    db.deal.deleteMany.mockResolvedValue({ count: 1 });

    await deleteDeal(10);

    expect(audit.mock.calls[0][0]).toBe("deal");
    expect(audit.mock.calls[0][2]).toBe("delete");
  });
});

describe("integration credential audit coverage", () => {
  it("logs a create when no credential exists yet (without leaking values)", async () => {
    db.integrationCredential.findUnique.mockResolvedValue(null);
    db.integrationCredential.upsert.mockResolvedValue({ id: 3 });

    await saveIntegrationCredential("gmail", { apiKey: "super-secret" });

    expect(audit.mock.calls[0][0]).toBe("integration_credential");
    expect(audit.mock.calls[0][2]).toBe("create");
    // The secret value must never appear in the audit payload.
    expect(JSON.stringify(audit.mock.calls[0])).not.toContain("super-secret");
  });

  it("logs an update when the credential already exists", async () => {
    db.integrationCredential.findUnique.mockResolvedValue({ id: 3 });
    db.integrationCredential.upsert.mockResolvedValue({ id: 3 });

    await saveIntegrationCredential("gmail", { apiKey: "k" });

    expect(audit.mock.calls[0][2]).toBe("update");
  });

  it("disconnectIntegration logs an update", async () => {
    db.integrationCredential.findUnique.mockResolvedValue({ id: 3, isActive: true });
    db.integrationCredential.updateMany.mockResolvedValue({ count: 1 });

    await disconnectIntegration("gmail");

    expect(audit.mock.calls[0][0]).toBe("integration_credential");
    expect(audit.mock.calls[0][2]).toBe("update");
  });
});

describe("custom field audit coverage", () => {
  it("upsertCustomField logs a create for a new field", async () => {
    db.pipelineCustomField.create.mockResolvedValue({ id: 5 });

    await upsertCustomField(fd({ pipelineId: "1", label: "Risk", type: "text" }));

    expect(audit.mock.calls[0][0]).toBe("custom_field");
    expect(audit.mock.calls[0][2]).toBe("create");
  });

  it("upsertCustomField logs an update for an existing field", async () => {
    db.pipelineCustomField.findUnique.mockResolvedValue({ label: "Risk", type: "text", required: false, position: 0 });
    db.pipelineCustomField.update.mockResolvedValue({ id: 5 });

    await upsertCustomField(fd({ pipelineId: "1", fieldId: "5", key: "risk", label: "Risk level", type: "text" }));

    expect(audit.mock.calls[0][0]).toBe("custom_field");
    expect(audit.mock.calls[0][2]).toBe("update");
  });

  it("deleteCustomField logs a delete", async () => {
    db.pipelineCustomField.findUnique.mockResolvedValue({ pipelineId: 1, key: "risk", label: "Risk", type: "text" });
    db.pipelineCustomField.delete.mockResolvedValue({ id: 5 });

    await deleteCustomField(5);

    expect(audit.mock.calls[0][0]).toBe("custom_field");
    expect(audit.mock.calls[0][2]).toBe("delete");
  });
});

describe("tagging audit coverage", () => {
  it("addTag logs a tagging create", async () => {
    db.tag.upsert.mockResolvedValue({ id: 1, name: "vip" });
    db.tagging.upsert.mockResolvedValue({ id: 99 });

    await addTag("company", 1, "vip");

    expect(audit.mock.calls[0][0]).toBe("tagging");
    expect(audit.mock.calls[0][2]).toBe("create");
  });

  it("removeTag logs a tagging delete", async () => {
    db.tagging.findUnique.mockResolvedValue({ id: 99 });
    db.tagging.deleteMany.mockResolvedValue({ count: 1 });

    await removeTag("company", 1, 1);

    expect(audit.mock.calls[0][0]).toBe("tagging");
    expect(audit.mock.calls[0][2]).toBe("delete");
  });
});
