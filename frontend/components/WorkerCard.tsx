import React from 'react';
import { WorkerMetrics } from '../services/types';
import { Sparklines, SparklinesLine } from 'react-sparklines';
import { UserIcon } from '@heroicons/react/24/solid';
import { useWorkerSeries } from '../hooks/useSeries';

type CachedResp = {
  ok?: boolean;
  cached?: boolean;
  metrics?: WorkerMetrics;
  updated_at?: string;
};

type Props = {
  workerId: string;
  data?: CachedResp | null;
  loading?: boolean;
  start?: string;
  end?: string;
};

function UtilBar({ pct }: { pct: number }) {
  const val = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="w-full bg-slate-200 h-2 rounded overflow-hidden mt-2">
      <div className="h-2 bg-emerald-500" style={{ width: `${val}%` }} />
    </div>
  );
}

export default function WorkerCard({ workerId, data, loading, start, end }: Props) {
  const metrics = data?.metrics ?? null;
  const updatedAt = data?.updated_at ?? null;

  const { series, isLoading: seriesLoading } = useWorkerSeries(workerId, start ?? '2026-01-15T09:00:00Z', end ?? '2026-01-15T17:00:00Z');

  if (loading || !metrics) {
    return <div className="p-4 rounded-lg bg-white shadow animate-pulse h-44" />;
  }

  const sparkValues = series.map(s => s.units);

  return (
    <div className="bg-white p-4 rounded-lg shadow hover:shadow-lg transition transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <UserIcon className="w-6 h-6 text-slate-500" />
          <h4 className="text-lg font-semibold text-slate-800">{metrics.worker_id}</h4>
        </div>

        <div className="text-xs text-slate-500">Units/hr <span className="font-medium">{metrics.units_per_hour}</span></div>
      </div>

      <div className="text-sm text-slate-700 space-y-1 mb-3">
        <div>Utilization: <span className="font-medium">{metrics.utilization_percent}%</span></div>
        <div>Active: <span className="font-medium">{(metrics.total_active_seconds / 3600).toFixed(2)} hrs</span></div>
        <div>Idle: <span className="font-medium">{(metrics.total_idle_seconds / 3600).toFixed(2)} hrs</span></div>
        <div>Total units: <span className="font-medium">{metrics.total_units}</span></div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex-1">
          {!seriesLoading && sparkValues.length > 0 ? (
            <div className="w-40">
              <Sparklines data={sparkValues} limit={sparkValues.length || 8} width={100} height={28} margin={4}>
                <SparklinesLine color="#10b981" style={{ strokeWidth: 2, fill: 'none' }} />
              </Sparklines>
            </div>
          ) : (
            <div className="h-8 bg-slate-100 rounded w-40" />
          )}
        </div>

        <div className="text-right text-xs text-slate-400">
          {updatedAt ? <div>Refreshed: {new Date(updatedAt).toLocaleTimeString()}</div> : <div className="italic">Not cached</div>}
        </div>
      </div>

      <UtilBar pct={metrics.utilization_percent} />
    </div>
  );
}