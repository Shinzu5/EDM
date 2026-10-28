/**
 * ApiEnvelope helpers + the ApiError class surfaced by middleware/errors.ts.
 * Every route responds with `{ success, data }` or `{ success, error }`.
 */
import type { ApiEnvelope } from '@medidata/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const ok = <T>(data: T): ApiEnvelope<T> => ({ success: true, data });

export const fail = (code: string, message: string): { success: false; error: { code: string; message: string } } => ({
  success: false,
  error: { code, message },
});

/** Paged list payload used by every list endpoint. */
export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const paged = <T>(items: T[], page: number, pageSize: number, total: number): Paged<T> => ({
  items,
  page,
  pageSize,
  total,
  totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
});
