export interface ContactPerson {
  id: number
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

export interface ContactCompany {
  id: number
  name: string
  vatNumber: string | null
}

export interface Contact {
  id: number
  tenantId: number
  personId: number
  companyId: number
  role: string | null
  email: string | null
  phone: string | null
  isPrimary: boolean
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  person: ContactPerson
  company: ContactCompany
}
