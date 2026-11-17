// Script-only stand-in for next/headers: an empty cookie jar, so the Supabase client finds no session (no actor user).
const jar = { getAll: () => [], get: () => undefined, has: () => false, set() {}, delete() {} };
export async function cookies() { return jar; }
export async function headers() { return new Headers(); }
