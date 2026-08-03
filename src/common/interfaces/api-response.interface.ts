export interface RequestMeta {
  requestId: string;
  timestamp: string;
  path: string;
  method: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedMeta extends RequestMeta {
  pagination: PaginationMeta;
}

export interface ApiResponse<T> {
  statusCode: number;
  data: T;
  meta: RequestMeta | PaginatedMeta;
}
