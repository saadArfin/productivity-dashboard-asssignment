import { useApi } from './useApi';
import { WorkerMetrics, WorkstationMetrics, FactoryMetrics } from '../services/types';

export const DEFAULT_START = '2026-01-15T09:00:00Z';
export const DEFAULT_END   = '2026-01-15T17:00:00Z';

/**
 * Each hook returns the entire backend response object (so we can use updated_at, cached flag, etc.)
 * Example response shape expected from backend: { ok: true, cached: boolean, metrics: {...}, updated_at: "..." }
 */

export function useFactoryMetrics(start = DEFAULT_START, end = DEFAULT_END, populate = false) {
  const url = `/api/metrics/cache/factory?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${populate ? '&populate=true' : ''}`;
  return useApi<{ ok: boolean; cached?: boolean; metrics?: FactoryMetrics; updated_at?: string }>(url);
}

export function useWorkerMetrics(workerId: string, start = DEFAULT_START, end = DEFAULT_END, populate = false) {
  const url = `/api/metrics/cache/worker/${workerId}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${populate ? '&populate=true' : ''}`;
  return useApi<{ ok: boolean; cached?: boolean; metrics?: WorkerMetrics; updated_at?: string }>(url);
}

export function useWorkstationMetrics(workstationId: string, start = DEFAULT_START, end = DEFAULT_END, populate = false) {
  const url = `/api/metrics/cache/workstation/${workstationId}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${populate ? '&populate=true' : ''}`;
  return useApi<{ ok: boolean; cached?: boolean; metrics?: WorkstationMetrics; updated_at?: string }>(url);
}