/**
 * Recursively convert Date objects to ISO strings so they cross
 * the RSC → Client Component boundary as serializable values.
 * Per Next.js best practices: never pass Date objects as props to client components.
 */
export function serializeDates<T>(value: T): T {
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) return value.map(serializeDates) as unknown as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, serializeDates(v)])
    ) as unknown as T;
  }
  return value;
}
