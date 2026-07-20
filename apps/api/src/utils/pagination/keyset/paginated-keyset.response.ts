export interface PaginatedKeysetResponseMeta {
  next: string | object | null
}

export interface PaginatedKeysetResponse<T> {
  items: T[]
  meta: PaginatedKeysetResponseMeta
}
