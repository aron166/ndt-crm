import { vi } from "vitest";

/**
 * A stand-in for @/lib/actor whose gates run on the mocked getActor, the way
 * the real gates do, so a test configures one thing (getActor) and every gate
 * an action uses follows it.
 *   vi.mock("@/lib/actor", async () => (await import("@/test/actor-mock")).actorMock("x"));
 */
export function actorMock(notACrmUser: string, getActor = vi.fn()) {
  const userId = async (t: number): Promise<number | null> => ((await getActor(t)) as { userId: number | null }).userId;
  return {
    getActor,
    NOT_A_CRM_USER: notACrmUser,
    requireCrmUser: async (t: number) => ((await userId(t)) == null ? notACrmUser : null),
    requireCrmUserId: async (t: number) => {
      const id = await userId(t);
      return id == null ? { ok: false as const, error: notACrmUser } : { userId: id };
    },
  };
}
