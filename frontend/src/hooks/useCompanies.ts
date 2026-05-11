import { useQuery } from '@tanstack/react-query'
import type { PaginatedResponse } from '../../../shared/types/index'
import type { Company, ListCompaniesParams } from '@/types/company'
import api from '@/lib/api'

async function fetchCompanies(params: ListCompaniesParams): Promise<PaginatedResponse<Company>> {
  const res = await api.get<PaginatedResponse<Company>>('/companies', { params })
  return res.data
}

export function useCompanies(params: ListCompaniesParams) {
  return useQuery({
    queryKey: ['companies', params],
    queryFn: () => fetchCompanies(params),
    placeholderData: (prev) => prev,
  })
}
