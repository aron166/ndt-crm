export interface Interaction {
  id: number
  tenantId: number
  companyId: number | null
  personId: number | null
  userId: number | null
  type: string | null       // call, email, meeting, note, site_visit
  direction: string | null  // inbound, outbound
  notes: string | null
  outcome: string | null
  occurredAt: string
  createdAt: string
  user: { id: number; name: string } | null
  company: { id: number; name: string } | null
  person: { id: number; firstName: string; lastName: string } | null
}
