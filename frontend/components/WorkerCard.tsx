import { WorkerMetrics } from "../services/types";

type Props = { metrics?: WorkerMetrics | null; loading?: boolean };

function UtilBar({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="w-full bg-slate-200 h-2 rounded overflow-hidden mt-2">
      <div className="h-2 bg-emerald-500" style={{ width: `${safe}%` }} />
    </div>
  );
}

export default function WorkerCard({ metrics, loading }: Props) {
  if (loading || !metrics) {
    return <div className="p-4 rounded-lg bg-white shadow animate-pulse h-44" />;
  }

  return (
    <div className="p-4 rounded-lg bg-white shadow">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-lg font-semibold text-slate-800">{metrics.worker_id}</h4>
        <div className="text-xs text-slate-500">Units/hr: <span className="font-medium">{metrics.units_per_hour}</span></div>
      </div>

      <div className="text-sm text-slate-700 space-y-1">
        <div>Utilization: <span className="font-medium">{metrics.utilization_percent}%</span></div>
        <div>Active: <span className="font-medium">{(metrics.total_active_seconds/3600).toFixed(2)} hrs</span></div>
        <div>Idle: <span className="font-medium">{(metrics.total_idle_seconds/3600).toFixed(2)} hrs</span></div>
        <div>Total units: <span className="font-medium">{metrics.total_units}</span></div>
      </div>

      <UtilBar pct={metrics.utilization_percent} />
    </div>
  );
}