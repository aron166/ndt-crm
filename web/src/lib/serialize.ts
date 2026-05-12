/**
 * Recursively converts Date objects to ISO strings and Prisma Decimal objects
 * to numbers so they cross the RSC → Client Component boundary as serializable values.
 * Per Next.js best practices: never pass non-serializable objects as props to client components.
 */
export function serializeDates<T>(value: T): T {
  if (value instanceof Date) return value.toISOString() as unknown as T;
  // Prisma Decimal: has a toNumber() method but is not a plain number
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).toNumber === "function"
  ) {
    return ((value as unknown) as { toNumber: () => number }).toNumber() as unknown as T;
  }
  if (Array.isArray(value)) return value.map(serializeDates) as unknown as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, serializeDates(v)])
    ) as unknown as T;
  }
  return value;
}
