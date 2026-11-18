import "server-only";

export interface MailboxConfig { host: string; port: number; secure: boolean; user: string; pass: string; dailyCap: number }
export function mailboxConfig(_env: Record<string, string | undefined> = process.env): MailboxConfig | null {
  throw new Error("not implemented");
}
export interface MailboxSendInput { tenantId: number; to: string; subject: string; text: string; replyTo?: string | null; fromName?: string | null; headers?: Record<string, string>; companyId?: number | null; personId?: number | null }
export type MailboxSendResult = { ok: true; id: string; warning?: string } | { ok: false; error: string; auth: boolean };
export async function sendViaMailbox(_cfg: MailboxConfig, _input: MailboxSendInput, _opts?: { tls?: { rejectUnauthorized: boolean }; ignoreTLS?: boolean }): Promise<MailboxSendResult> {
  throw new Error("not implemented");
}
