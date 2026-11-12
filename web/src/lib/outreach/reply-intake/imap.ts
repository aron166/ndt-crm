import "server-only";
import { ImapFlow } from "imapflow";

export type ImapConfig = { host: string; port: number; user: string; pass: string };

/** null = not configured: the cron route then does nothing. */
export function imapConfig(env: Record<string, string | undefined> = process.env): ImapConfig | null {
  const { IMAP_HOST: host, IMAP_USER: user, IMAP_PASSWORD: pass } = env;
  if (!host || !user || !pass) return null;
  return { host, port: Number(env.IMAP_PORT) || 993, user, pass };
}

const MAX_PER_POLL = 300;

/** Raw source of the last `sinceDays` days of INBOX. Read-only: never marks seen, moves or deletes (a human reads this mailbox). */
export async function fetchRecent(cfg: ImapConfig, sinceDays = 14): Promise<Buffer[]> {
  const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const uids = await client.search({ since: new Date(Date.now() - sinceDays * 86_400_000) }, { uid: true });
      const out: Buffer[] = [];
      // newest first when over the cap
      for (const uid of (uids || []).slice(-MAX_PER_POLL)) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (msg && msg.source) out.push(msg.source);
      }
      return out;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
