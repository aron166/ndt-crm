import { useQuery } from '@tanstack/react-query'
import type { PaginatedResponse } from '../../../shared/types/index'
import type { Interaction } from '@/types/interaction'
import api from '@/lib/api'

async function fetchPersonInteractions(
  personId: number,
  page: number,
  pageSize: number,
): Promise<PaginatedResponse<Interaction>> {
  const res = await api.get<PaginatedResponse<Interaction>>(
    `/persons/${personId}/interactions`,
    { params: { page, pageSize } },
  )
  return res.data
}

export function usePersonInteractions(personId: number, page = 1, pageSize = 15) {
  return useQuery({
    queryKey: ['person-interactions', personId, page],
    queryFn: () => fetchPersonInteractions(personId, page, pageSize),
    enabled: personId > 0,
    placeholderData: (prev) => prev,
  })
}
