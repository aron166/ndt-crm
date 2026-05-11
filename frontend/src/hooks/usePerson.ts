import { useQuery } from '@tanstack/react-query'
import type { Person } from '@/types/person'
import api from '@/lib/api'

async function fetchPerson(id: number): Promise<Person> {
  const res = await api.get<{ data: Person }>(`/persons/${id}`)
  return res.data.data
}

export function usePerson(id: number) {
  return useQuery({
    queryKey: ['person', id],
    queryFn: () => fetchPerson(id),
    enabled: id > 0,
  })
}
