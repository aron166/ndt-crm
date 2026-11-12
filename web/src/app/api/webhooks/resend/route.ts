import { NextResponse } from "next/server";
import { DEFAULT_TENANT_ID } from "@/lib/integrations/resend";
import { processResendEvent, verifyResendSignature } from "@/lib/integrations/resend-webhook";
import { reportError } from "@/lib/report-error";

// Signed by Resend (Svix), no session; on isServiceApiPath.
// shortcut: one secret = tenant 1, upgrade to a per-tenant secret in integration_credentials with the second tenant
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Resend webhook not configured" }, { status: 503 });

  const raw = await request.text(); // the signature covers these exact bytes
  const id = request.headers.get("svix-id");
  const ok = verifyResendSignature(
    raw,
    { id, timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") },
    secret,
  );
  if (!ok || !id) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    const r = await processResendEvent(DEFAULT_TENANT_ID, id, parsed);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    // 500 makes Resend retry; the row stays unprocessed so the retry redoes the effects.
    reportError("webhooks.resend", err, { svixId: id });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
