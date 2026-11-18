// Which way a campaign's e-mails leave (2026-11-18). Leaf file: imported by the launch tab (client) and the service,
// so it imports nothing. Resend's acceptable use policy forbids cold outreach, so a prospect e-mail campaign never
// goes through Resend: it uses the Workspace mailbox (SMTP, lib/integrations/mailbox) or a CSV export for a
// cold-mail tool. Hungarian copy is PROPOSAL until Áron approves it.

export const SEND_ROUTES = ["resend", "mailbox", "export"] as const;
export type SendRoute = (typeof SEND_ROUTES)[number];

export const ROUTE_LABELS: Record<SendRoute, string> = {
  resend: "Resend (rendszerlevél)",
  mailbox: "Postafiók (Google Workspace)",
  export: "Export hidegküldő eszközbe (CSV)",
};

export const RESEND_PROSPECT_REFUSAL =
  "A Resend feltételei tiltják a hideg megkeresést, ezért prospect kampány csak a postafiókon vagy exporttal indulhat: válassz küldési utat.";

/** campaigns.audience.route; anything else (a pre-route row) is Resend. */
export function routeOf(audience: unknown): SendRoute {
  const r = (audience as { route?: unknown } | null)?.route;
  return (SEND_ROUTES as readonly string[]).includes(r as string) ? (r as SendRoute) : "resend";
}

/** A member campaign on a prospect list with an e-mail step: cold e-mail in the sense of Resend's policy. */
export function isProspectEmail(c: { kind: string | null; audienceSource: string; steps: readonly { channel: string }[] }): boolean {
  return ["cold_call", "cold_email", "sequence"].includes(c.kind ?? "") && c.audienceSource === "prospect_list" && c.steps.some((s) => s.channel === "email");
}

/** Null when the route may carry this campaign; else the one-sentence reason the launch is refused. */
export function routeRefusal(route: SendRoute, prospectEmail: boolean): string | null {
  return route === "resend" && prospectEmail ? RESEND_PROSPECT_REFUSAL : null;
}

/** Seconds the mailbox waits after its last send: 60 to 180, pseudo-random per last draft id, the same on every tick. */
export function mailboxGapSeconds(lastDraftId: number): number {
  return 60 + (Math.imul(lastDraftId, 2654435761) >>> 0) % 121;
}
