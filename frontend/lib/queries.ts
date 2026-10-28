'use client';

/**
 * Thin wrapper over useQuery that wires the typed apiFetch client (envelope
 * unwrapping, ApiError typing, cancellation, offline detection) with sane
 * defaults for the whole app.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ZodType } from 'zod';
import { ApiError, apiFetch } from '@/lib/api';

export const DEFAULT_STALE_TIME = 30_000;

type UseApiQueryOptions<T> = {
  enabled?: boolean;
  staleTime?: number;
  /** Optional zod schema to validate/parse the unwrapped payload. */
  schema?: ZodType<T>;
};

export function useApiQuery<T>(
  queryKey: readonly unknown[],
  path: string,
  options: UseApiQueryOptions<T> = {},
): UseQueryResult<T, ApiError> {
  return useQuery<T, ApiError>({
    queryKey,
    queryFn: async ({ signal }) => {
      const data = await apiFetch<T>(path, { signal });
      return options.schema ? options.schema.parse(data) : data;
    },
    enabled: options.enabled ?? true,
    staleTime: options.staleTime ?? DEFAULT_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false;
      return failureCount < 1;
    },
  });
}
