
export interface WorkerMetrics {
  worker_id: string;
  window_start: string;
  window_end: string;
  total_window_seconds: number;
  total_active_seconds: number;
  total_idle_seconds: number;
  total_absent_seconds: number;
  utilization_percent: number;
  total_units: number;
  units_per_hour: number;
}

export interface WorkstationMetrics {
  workstation_id: string;
  window_start: string;
  window_end: string;
  total_window_seconds: number;
  occupancy_seconds: number;
  utilization_percent: number;
  total_units: number;
  throughput_per_hour: number;
}

export interface FactoryMetrics {
  window_start: string;
  window_end: string;
  total_window_seconds: number;
  total_productive_seconds: number;
  total_units: number;
  average_production_rate_per_worker_per_hour: number;
  average_utilization_percent: number;
  workers_count: number;
}

export type CachedResponse<T> = { ok: true; cached: boolean; metrics: T; updated_at?: string };