import { useQuery } from '@tanstack/react-query'
import type { Contact } from '@/types/contact'
import api from '@/lib/api'

async function fetchCompanyContacts(companyId: number): Promise<Contact[]> {
  const res = await api.get<{ data: Contact[] }>(`/companies/${companyId}/contacts`)
  return res.data.data
}

export function useCompanyContacts(companyId: number) {
  return useQuery({
    queryKey: ['company-contacts', companyId],
    queryFn: () => fetchCompanyContacts(companyId),
    enabled: companyId > 0,
  })
}
