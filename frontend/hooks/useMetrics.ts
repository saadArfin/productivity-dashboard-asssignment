import { useApi } from './useApi';
import { WorkerMetrics, WorkstationMetrics, FactoryMetrics } from '../services/types';

export const DEFAULT_START = '2026-01-15T09:00:00Z';
export const DEFAULT_END   = '2026-01-15T17:00:00Z';


export function useFactoryMetrics(start = DEFAULT_START, end = DEFAULT_END, populate = false) {
  const populateFlag = populate ? '&populate=true' : '';
  const url = `/api/metrics/cache/factory?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${populateFlag}`;
  return useApi<{ ok: boolean; cached: boolean; metrics: FactoryMetrics }>(url);
}

export function useWorkerMetrics(id: string, start = DEFAULT_START, end = DEFAULT_END, populate = false) {
  const populateFlag = populate ? '&populate=true' : '';
  const url = `/api/metrics/cache/worker/${id}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${populateFlag}`;
  return useApi<{ ok: boolean; cached: boolean; metrics: WorkerMetrics }>(url);
}

export function useWorkstationMetrics(id: string, start = DEFAULT_START, end = DEFAULT_END, populate = false) {
  const populateFlag = populate ? '&populate=true' : '';
  const url = `/api/metrics/cache/workstation/${id}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${populateFlag}`;
  return useApi<{ ok: boolean; cached: boolean; metrics: WorkstationMetrics }>(url);
}