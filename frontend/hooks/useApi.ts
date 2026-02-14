import useSWR from 'swr';
import API from '../services/api';

export const fetcher = (url: string) => API.get(url).then(res => res.data);

/**
 * useApi - small wrapper around SWR + axios fetcher
 * returns { data, error, mutate, isLoading, isValidating }
 */
export function useApi<T = any>(url: string | null, opts?: { revalidateOnFocus?: boolean }) {
  const { data, error, mutate, isValidating } = useSWR<T | null>(url, url ? fetcher : null, {
    revalidateOnFocus: opts?.revalidateOnFocus ?? false,
  });

  return {
    data: data ?? null,
    error,
    mutate,
    isLoading: !data && !error,
    isValidating
  };
}