export interface Person {
  id: number
  tenantId: number
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface PersonSummary extends Person {
  currentCompany: { id: number; name: string } | null
}

export interface ListPersonsParams {
  page?: number
  pageSize?: number
  search?: string
}
