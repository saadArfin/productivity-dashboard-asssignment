import useSWR from 'swr';
import API from '../services/api';

export const fetcher = (url: string) => API.get(url).then(r => r.data);

export function useApi<T = any>(url: string) {
  const { data, error, mutate, isValidating } = useSWR<T>(url, fetcher, { revalidateOnFocus: false });
  return { data, error, mutate, isLoading: !data && !error, isValidating };
}