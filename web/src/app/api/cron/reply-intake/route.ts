import { reportError } from "@/lib/report-error";
import { getResendConfig } from "@/lib/integrations/resend";
import { fetchRecent, imapConfig } from "@/lib/outreach/reply-intake/imap";
import { FREE_MAIL } from "@/lib/outreach/reply-intake/classify";
import { markInboxChecked, processedImapIds, runReplyIntake } from "@/lib/outreach/reply-intake/run";

export const runtime = "nodejs";
export const maxDuration = 60;

const TENANT_ID = 1;
const domainOf = (addr: string | undefined) => addr?.split("@")[1]?.trim().toLowerCase();

// Polls the sending mailbox over IMAP (read-only) and feeds replies, opt-outs and bounces into the
// existing handling. CRON_SECRET bearer like cron/automations. IMAP_* unset = not configured.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const cfg = imapConfig();
  if (!cfg) return Response.json({ ok: true, configured: false });

  let fetched: Awaited<ReturnType<typeof fetchRecent>>;
  try {
    fetched = await fetchRecent(cfg, (ids) => processedImapIds(TENANT_ID, ids));
  } catch (err) {
    reportError("cron.reply-intake.imap", err);
    return Response.json({ ok: false, error: "IMAP" }, { status: 502 });
  }
  try {
    const resend = await getResendConfig(TENANT_ID);
    // A free-mail domain is never ours; a subdomain sender (send.example.hu) also owns its root (shortcut: last two labels, wrong for co.uk-style suffixes).
    const own = [domainOf(resend?.fromEmail), domainOf(cfg.user)].filter((d): d is string => !!d);
    const ourDomains = [...new Set(own.flatMap((d) => [d, d.split(".").slice(-2).join(".")]))].filter((d) => !FREE_MAIL.has(d));
    const now = new Date();
    const result = await runReplyIntake(TENANT_ID, fetched.messages, now, ourDomains);
    // Only a complete, clean read counts as "inbox checked".
    const inboxChecked = fetched.complete && result.failed === 0;
    if (inboxChecked) await markInboxChecked(TENANT_ID, now);
    if (result.failed > 0) reportError("cron.reply-intake.failed", new Error(`${result.failed} message(s) failed`));
    return Response.json({ configured: true, ...result, inboxChecked });
  } catch (err) {
    reportError("cron.reply-intake", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
