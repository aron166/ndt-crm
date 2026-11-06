// Who is acting, for which tenant: what every service write needs for tenant
// scoping and audit attribution. Built by userLeadCtx (lib/actor.ts) for a
// signed-in human, by agentCtx for an app-key caller.
export interface LeadCtx {
  tenantId: number;
  /** `users.id` of the acting human, null for app/agent callers. */
  userId: number | null;
  actor: "user" | "agent";
  /** App slug / agent id for audit attribution when actor = agent. */
  actorAgentId?: string;
}

/** The ctx for an app or agent acting through its key (or an internal job). */
export function agentCtx(tenantId: number, agentId: string): LeadCtx {
  return { tenantId, userId: null, actor: "agent", actorAgentId: agentId };
}
