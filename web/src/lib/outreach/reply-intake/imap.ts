import "server-only";
import { ImapFlow } from "imapflow";

export type ImapConfig = { host: string; port: number; user: string; pass: string };

/** null = not configured: the cron route then does nothing. */
export function imapConfig(env: Record<string, string | undefined> = process.env): ImapConfig | null {
  const { IMAP_HOST: host, IMAP_USER: user, IMAP_PASSWORD: pass } = env;
  if (!host || !user || !pass) return null;
  return { host, port: Number(env.IMAP_PORT) || 993, user, pass };
}

const MAX_PER_POLL = 100;

/**
 * Raw source of the last `sinceDays` days of INBOX. Read-only: never marks seen, moves or deletes (a human reads this mailbox).
 * Envelopes first; the source is downloaded only for mails not yet processed (`isProcessed` keeps this file db-free).
 * complete = false when the search failed or more new mails remained than the cap: the caller must not call the inbox checked.
 */
export async function fetchRecent(
  cfg: ImapConfig,
  isProcessed: (ids: string[]) => Promise<Set<string>>,
  sinceDays = 14,
): Promise<{ messages: Buffer[]; complete: boolean }> {
  const client = new ImapFlow({
    host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false,
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 30000,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const uids = await client.search({ since: new Date(Date.now() - sinceDays * 86_400_000) }, { uid: true });
      if (!Array.isArray(uids)) return { messages: [], complete: false };
      const envs: { uid: number; id?: string }[] = [];
      if (uids.length) for await (const m of client.fetch(uids, { uid: true, envelope: true }, { uid: true })) envs.push({ uid: m.uid, id: m.envelope?.messageId });
      const done = await isProcessed(envs.flatMap((e) => (e.id ? [e.id] : [])));
      const todo = envs.filter((e) => !(e.id && done.has(e.id)));
      const out: Buffer[] = [];
      // newest first when over the cap
      for (const e of todo.slice(-MAX_PER_POLL)) {
        const msg = await client.fetchOne(String(e.uid), { source: true }, { uid: true });
        if (msg && msg.source) out.push(msg.source);
      }
      return { messages: out, complete: todo.length <= MAX_PER_POLL };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
