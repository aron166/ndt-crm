import { describe, it, expect, vi, beforeEach } from "vitest";

const found = vi.fn();
vi.mock("@/lib/db", () => {
  const model = () => ({ findFirst: (args: unknown) => found(args) });
  return { db: { company: model(), person: model(), deal: model(), task: model(), pipeline: model(), pipelineStage: model(), agent: model() } };
});

import { foreignIdError } from "./tenant-refs";
import { hubRefsInTenant } from "./hub/refs";

describe("ids from input must belong to the tenant", () => {
  beforeEach(() => found.mockReset());

  it("passes when every given id is the tenant's, and skips the ones not given", async () => {
    found.mockResolvedValue({ id: 1 });
    expect(await foreignIdError(1, { companyId: 5, personId: null })).toBeNull();
    expect(found).toHaveBeenCalledTimes(1);
    expect(found.mock.calls[0][0]).toMatchObject({ where: { id: 5, tenantId: 1 } });
  });

  it("names the first foreign id, in company, person, deal, task order", async () => {
    found.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
    expect(await foreignIdError(1, { companyId: 5, personId: 6, taskId: 7 })).toBe("Személy nem található");
    found.mockResolvedValue(null);
    expect(await foreignIdError(1, { taskId: 7 })).toBe("Feladat nem található");
  });

  it("scopes a stage through its pipeline's tenant", async () => {
    found.mockResolvedValue(null);
    expect(await foreignIdError(2, { stageId: 3 })).toBe("Szakasz nem található");
    expect(found.mock.calls[0][0]).toMatchObject({ where: { id: 3, pipeline: { tenantId: 2 } } });
  });

  it("hub records: a foreign person or company is refused, agents are global", async () => {
    found.mockResolvedValue({ id: 1 });
    expect(await hubRefsInTenant(1, { agentId: 9, personId: 2 })).toBe(true);
    expect(found.mock.calls[0][0]).toEqual({ where: { id: 9 }, select: { id: true } });
    found.mockReset().mockResolvedValueOnce(null);
    expect(await hubRefsInTenant(1, { companyId: 4 })).toBe(false);
    expect(found.mock.calls[0][0]).toMatchObject({ where: { id: 4, tenantId: 1, deletedAt: null } });
  });
});
