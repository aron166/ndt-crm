import { useQuery } from '@tanstack/react-query'
import type { Company } from '@/types/company'
import api from '@/lib/api'

async function fetchCompany(id: number): Promise<Company> {
  const res = await api.get<{ data: Company }>(`/companies/${id}`)
  return res.data.data
}

export function useCompany(id: number) {
  return useQuery({
    queryKey: ['company', id],
    queryFn: () => fetchCompany(id),
    enabled: id > 0,
  })
}
