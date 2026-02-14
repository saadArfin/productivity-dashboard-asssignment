import useSWR from 'swr';
import API from '../services/api';

const seriesFetcher = (url: string) => API.get(url).then(r => r.data);

/**
 * Returns hourly series for a worker:
 * { series: [{hour: ISO, units: number}, ...], isLoading, error, mutate }
 */
export function useWorkerSeries(workerId: string, start: string, end: string) {
  if (!workerId) {
    return { series: [] as { hour: string; units: number }[], isLoading: false, error: null, mutate: async () => {} };
  }
  const url = `/api/metrics/worker/${workerId}/series?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  const { data, error, mutate, isValidating } = useSWR<{ ok?: boolean; series?: { hour: string; units: number }[] }>(url, seriesFetcher, { revalidateOnFocus: false });
  return {
    series: data?.series ?? [],
    isLoading: !data && !error,
    error,
    mutate
  };
}