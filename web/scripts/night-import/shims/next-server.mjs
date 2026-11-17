// Script-only stand-in for next/server: after() callbacks run (and are awaited by flushAfter) instead of
// throwing outside a request, so the service's audit rows are still written.
const pending = [];
export function after(fn) { pending.push(Promise.resolve().then(fn)); }
export async function flushAfter() { while (pending.length) await pending.shift(); }
export class NextResponse extends Response { static json(b, i) { return new Response(JSON.stringify(b), i); } }
export class NextRequest extends Request {}
