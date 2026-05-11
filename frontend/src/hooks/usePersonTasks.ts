import { useQuery } from '@tanstack/react-query'
import type { PaginatedResponse } from '../../../shared/types/index'
import type { Task } from '@/types/task'
import api from '@/lib/api'

async function fetchPersonTasks(
  personId: number,
  page: number,
  pageSize: number,
): Promise<PaginatedResponse<Task>> {
  const res = await api.get<PaginatedResponse<Task>>('/tasks', {
    params: { personId, page, pageSize, topLevelOnly: true },
  })
  return res.data
}

export function usePersonTasks(personId: number, page = 1, pageSize = 15) {
  return useQuery({
    queryKey: ['person-tasks', personId, page],
    queryFn: () => fetchPersonTasks(personId, page, pageSize),
    enabled: personId > 0,
    placeholderData: (prev) => prev,
  })
}
