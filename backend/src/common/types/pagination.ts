export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function buildMeta(total: number, page: number, pageSize: number): PaginationMeta {
  return { total, page, pageSize, pageCount: Math.ceil(total / pageSize) || 1 };
}
