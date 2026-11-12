import { reportError } from "@/lib/report-error";
import { getResendConfig } from "@/lib/integrations/resend";
import { fetchRecent, imapConfig } from "@/lib/outreach/reply-intake/imap";
import { markInboxChecked, runReplyIntake } from "@/lib/outreach/reply-intake/run";

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

  let messages: Buffer[];
  try {
    messages = await fetchRecent(cfg);
  } catch (err) {
    reportError("cron.reply-intake.imap", err);
    return Response.json({ ok: false, error: "IMAP" }, { status: 502 });
  }
  try {
    const resend = await getResendConfig(TENANT_ID);
    const ourDomains = [domainOf(resend?.fromEmail), domainOf(cfg.user)].filter((d): d is string => !!d);
    const now = new Date();
    const result = await runReplyIntake(TENANT_ID, messages, now, ourDomains);
    await markInboxChecked(TENANT_ID, now);
    return Response.json({ configured: true, ...result });
  } catch (err) {
    reportError("cron.reply-intake", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
