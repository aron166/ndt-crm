import { useQuery } from '@tanstack/react-query'
import type { Contact } from '@/types/contact'
import api from '@/lib/api'

async function fetchPersonContacts(personId: number): Promise<Contact[]> {
  const res = await api.get<{ data: Contact[] }>(`/persons/${personId}/contacts`)
  return res.data.data
}

export function usePersonContacts(personId: number) {
  return useQuery({
    queryKey: ['person-contacts', personId],
    queryFn: () => fetchPersonContacts(personId),
    enabled: personId > 0,
  })
}
