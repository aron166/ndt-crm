/** Prisma unique-constraint violation (P2002): the row already exists. Duck-typed so plain test doubles match too. */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "P2002";
}
