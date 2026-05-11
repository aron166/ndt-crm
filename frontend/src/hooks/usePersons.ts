import { useQuery } from '@tanstack/react-query'
import type { PaginatedResponse } from '../../../shared/types/index'
import type { PersonSummary, ListPersonsParams } from '@/types/person'
import api from '@/lib/api'

async function fetchPersons(params: ListPersonsParams): Promise<PaginatedResponse<PersonSummary>> {
  const res = await api.get<PaginatedResponse<PersonSummary>>('/persons', { params })
  return res.data
}

export function usePersons(params: ListPersonsParams) {
  return useQuery({
    queryKey: ['persons', params],
    queryFn: () => fetchPersons(params),
    placeholderData: (prev) => prev,
  })
}
